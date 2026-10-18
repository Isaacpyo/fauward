import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D6 delivery path (WP-2.2): one NotificationLog row per job, SKIPPED without a transport, SMTP as the vendor-free
// transport, usage counted once per sent job (ACC-L19-1).

const sendMailMock = vi.hoisted(() => vi.fn(async (_message: Record<string, unknown>) => ({ messageId: '<smtp-1@fauward.test>' })));

vi.mock('../../queues/queues.js', () => ({ bullmqConnection: {}, notificationQueue: { add: vi.fn() } }));
vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn();
    close = vi.fn(async () => undefined);
  },
  Worker: class {
    on = vi.fn();
    close = vi.fn(async () => undefined);
  }
}));

type Log = Record<string, unknown> & { id: string; status: string; jobId: string | null; attempts: number };

function createStore() {
  const logs: Log[] = [];
  const usage: Array<{ tenantId: string; month: string; emailsSent: number; smsSent: number }> = [];
  const prisma = {
    notificationLog: {
      upsert: vi.fn(async ({ where, create, update }: { where: { jobId: string }; create: Record<string, unknown>; update: { attempts: { increment: number } } }) => {
        const existing = logs.find((log) => log.jobId === where.jobId);
        if (existing) {
          existing.attempts += update.attempts.increment;
          return { ...existing };
        }
        const row: Log = Object.assign({ id: `log_${logs.length + 1}`, status: 'QUEUED', jobId: null, attempts: 0, error: null, provider: null, providerRef: null, sentAt: null }, create);
        logs.push(row);
        return { ...row };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Log = Object.assign({ id: `log_${logs.length + 1}`, status: 'QUEUED', jobId: null, attempts: 0 }, data);
        logs.push(row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = logs.find((log) => log.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: { not: string } }; data: Record<string, unknown> }) => {
        const hits = logs.filter((log) => log.id === where.id && log.status !== where.status.not);
        for (const row of hits) Object.assign(row, data);
        return { count: hits.length };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => logs.find((log) => log.id === where.id) ?? null)
    },
    usageRecord: {
      upsert: vi.fn(async ({ where, create, update }: { where: { tenantId_month: { tenantId: string; month: string } }; create: Record<string, number>; update: Record<string, { increment: number }> }) => {
        const key = where.tenantId_month;
        const existing = usage.find((row) => row.tenantId === key.tenantId && row.month === key.month);
        if (!existing) {
          usage.push({ tenantId: key.tenantId, month: key.month, emailsSent: create.emailsSent ?? 0, smsSent: create.smsSent ?? 0 });
          return {};
        }
        if (update.emailsSent) existing.emailsSent += update.emailsSent.increment;
        if (update.smsSent) existing.smsSent += update.smsSent.increment;
        return {};
      })
    },
    tenantSettings: { findUnique: vi.fn(async () => null) },
    tenant: { findUnique: vi.fn(async () => ({ plan: 'PRO' })) }
  };
  return { logs, usage, prisma };
}

function appFor(store: ReturnType<typeof createStore>) {
  return { prisma: store.prisma, redis: { incr: vi.fn(async () => 1), expire: vi.fn(async () => 1) }, log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } } as never;
}

async function loadWorker(env: { SMTP_URL?: string } = {}) {
  vi.resetModules();
  vi.stubEnv('SMTP_URL', env.SMTP_URL ?? '');
  vi.stubEnv('SENDGRID_API_KEY', '');
  if (env.SMTP_URL && !env.SMTP_URL.includes('localhost:5712')) {
    vi.doMock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: sendMailMock }) } }));
  } else {
    vi.doUnmock('nodemailer');
  }
  return import('./notifications.worker.js');
}

const emailJob = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: 'email',
  data: { tenantId: 'tenant_a', userId: 'user_1', channel: 'EMAIL', event: 'appeal_decided', to: 'admin@northwind.test', template: 'appeal_decided', data: { decision: 'APPROVED' }, ...overrides }
});

beforeEach(() => {
  sendMailMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('notification worker (D6, WP-2.2)', () => {
  it('ACC-NOT-2 without SENDGRID_API_KEY and SMTP_URL the log is SKIPPED and nothing throws', async () => {
    const store = createStore();
    const { processNotificationJob } = await loadWorker();
    await expect(processNotificationJob(appFor(store), emailJob('job-1'))).resolves.toBeTruthy();
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]).toMatchObject({ status: 'SKIPPED', error: 'EMAIL_PROVIDER_NOT_CONFIGURED', tenantId: 'tenant_a', recipient: 'admin@northwind.test', template: 'appeal_decided', jobId: 'job-1' });
    expect(store.usage).toEqual([]);
  });

  it('ACC-L14-1 a retried job reuses its row (attempts go up) instead of leaving a QUEUED row behind', async () => {
    const store = createStore();
    const { processNotificationJob } = await loadWorker();
    await processNotificationJob(appFor(store), emailJob('job-2'));
    await processNotificationJob(appFor(store), emailJob('job-2'));
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]).toMatchObject({ attempts: 2, status: 'SKIPPED' });
    expect(store.logs.some((log) => log.status === 'QUEUED')).toBe(false);
  });

  it('ACC-NOT-2 with SMTP_URL the email goes out over SMTP with the built-in content and the log is SENT', async () => {
    const store = createStore();
    const { processNotificationJob } = await loadWorker({ SMTP_URL: 'smtp://mail.test:1025' });
    await processNotificationJob(appFor(store), emailJob('job-3'));
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({ to: 'admin@northwind.test', subject: 'Your appeal was approved' });
    expect(store.logs[0]).toMatchObject({ status: 'SENT', provider: 'SMTP', providerRef: '<smtp-1@fauward.test>' });
  });

  it('ACC-L19-1 a SENT email increments emailsSent exactly once, even when the job is processed again', async () => {
    const store = createStore();
    const { processNotificationJob } = await loadWorker({ SMTP_URL: 'smtp://mail.test:1025' });
    await processNotificationJob(appFor(store), emailJob('job-4'));
    await processNotificationJob(appFor(store), emailJob('job-4'));
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(store.usage).toHaveLength(1);
    expect(store.usage[0].emailsSent).toBe(1);
  });

  it('a delivery error marks the log FAILED and rethrows so BullMQ retries', async () => {
    const store = createStore();
    sendMailMock.mockRejectedValueOnce(new Error('connection refused'));
    const { processNotificationJob } = await loadWorker({ SMTP_URL: 'smtp://mail.test:1025' });
    await expect(processNotificationJob(appFor(store), emailJob('job-5'))).rejects.toThrow('connection refused');
    expect(store.logs[0]).toMatchObject({ status: 'FAILED', error: 'connection refused' });
    expect(store.usage).toEqual([]);
  });

  it('staff emails are logged without a tenant and do not touch tenant usage', async () => {
    const store = createStore();
    const { processNotificationJob } = await loadWorker({ SMTP_URL: 'smtp://mail.test:1025' });
    await processNotificationJob(appFor(store), emailJob('job-6', { tenantId: 'system', userId: undefined, platformUserId: 'pu_1', template: 'staff_notification', data: { title: 'Appeal filed' } }));
    expect(store.logs[0]).toMatchObject({ tenantId: null, platformUserId: 'pu_1', status: 'SENT' });
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({ subject: '[Fauward console] Appeal filed' });
    expect(store.usage).toEqual([]);
  });

  it('SMS without Twilio is SKIPPED', async () => {
    const store = createStore();
    const { processNotificationJob } = await loadWorker();
    await processNotificationJob(appFor(store), { id: 'job-7', name: 'sms', data: { tenantId: 'tenant_a', channel: 'SMS', to: '+447700900000', message: 'Out for delivery' } });
    expect(store.logs[0]).toMatchObject({ status: 'SKIPPED', error: 'SMS_PROVIDER_NOT_CONFIGURED' });
  });
});

// Real SMTP round trip to Mailpit on the VM slot. Runs when MAILPIT_SMTP_URL and MAILPIT_API_URL are set
// (e.g. smtp://localhost:57126 and http://localhost:57125 for slot 1); CI skips it.
describe.runIf(process.env.MAILPIT_SMTP_URL && process.env.MAILPIT_API_URL)('SMTP delivery to Mailpit', () => {
  it('ACC-NOT-2 with SMTP_URL the email arrives in Mailpit', async () => {
    const store = createStore();
    const { processNotificationJob } = await loadWorker({ SMTP_URL: process.env.MAILPIT_SMTP_URL });
    const to = `acc-not-2-${Date.now()}@fauward.test`;
    await processNotificationJob(appFor(store), emailJob(`job-mailpit-${Date.now()}`, { to }));
    expect(store.logs[0]).toMatchObject({ status: 'SENT', provider: 'SMTP' });
    const response = await fetch(`${process.env.MAILPIT_API_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const body = (await response.json()) as { messages: Array<{ Subject: string; To: Array<{ Address: string }> }> };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].Subject).toBe('Your appeal was approved');
  });
});
