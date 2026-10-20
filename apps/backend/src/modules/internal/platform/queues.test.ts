import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { QueueBackend, QueueEntry, QueueJobState, RawQueueJob } from '../../../services/queue-operations.service.js';

// platform.queues (WP-3.6) over in-memory queue backends: counts, DLQ column, redacted jobs, replay, clean, pause.

type Staff = { id: string; permissions: Permission[]; mfaAgeMs?: number };
const STAFF: Record<string, Staff> = {
  pu_sre: { id: 'pu_sre', permissions: ['platform.queues.read', 'platform.queues.replay', 'platform.queues.purge'] },
  pu_reader: { id: 'pu_reader', permissions: ['platform.queues.read'] },
  pu_stale: { id: 'pu_stale', permissions: ['platform.queues.read', 'platform.queues.replay', 'platform.queues.purge'], mfaAgeMs: 60 * 60_000 }
};

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { headers: Record<string, unknown>; platform?: unknown }) => {
    const staff = STAFF[String(request.headers['x-test-user'] ?? 'pu_sre')];
    request.platform = {
      user: { id: staff.id, email: `${staff.id}@fauward.com`, name: null, status: 'ACTIVE', mfaEnabled: true },
      session: { id: `ps_${staff.id}`, mfaVerifiedAt: new Date(Date.now() - (staff.mfaAgeMs ?? 0)), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: staff.id }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async (_prisma: unknown, user: { id: string }) => {
    const permissions = STAFF[user.id].permissions;
    return { staff: null, roles: [], rolePermissions: new Set(permissions), jit: new Map(), permissions };
  })
}));
const audit = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../services/platform-audit.service.js', () => ({
  writePlatformAuditLog: vi.fn(async (_prisma: unknown, input: Record<string, unknown>) => {
    audit.push(input);
    return { id: `aud_${audit.length}` };
  })
}));
vi.mock('../../../queues/queues.js', () => ({}));
vi.mock('../../notifications/notifications.worker.js', () => ({}));
vi.mock('../../../queues/outbox.worker.js', () => ({}));
vi.mock('../../../queues/webhook.worker.js', () => ({}));

type StoredJob = RawQueueJob & { state: QueueJobState };

function memoryQueue(name: string): QueueBackend & { jobs: StoredJob[]; paused: boolean } {
  let seq = 0;
  const jobs: StoredJob[] = [];
  const queue = {
    name,
    jobs,
    paused: false,
    async counts() {
      const result: Record<QueueJobState, number> = { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 };
      for (const job of jobs) result[job.state] += 1;
      return result;
    },
    async finishedSince(state: 'completed' | 'failed', sinceMs: number) {
      return jobs.filter((job) => job.state === state && (job.finishedOn ?? 0) >= sinceMs).length;
    },
    async lastCompletedAt() {
      const done = jobs.filter((job) => job.state === 'completed').map((job) => job.finishedOn ?? 0);
      return done.length ? Math.max(...done) : null;
    },
    async isPaused() {
      return queue.paused;
    },
    async list(state: QueueJobState, start: number, end: number) {
      return jobs
        .filter((job) => job.state === state)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(start, end + 1);
    },
    async get(id: string) {
      return jobs.find((job) => job.id === id) ?? null;
    },
    async add(jobName: string, data: Record<string, unknown>) {
      seq += 1;
      jobs.push({ id: `${name}-${seq}`, name: jobName, data, attemptsMade: 0, failedReason: null, timestamp: Date.now() + seq, processedOn: null, finishedOn: null, state: 'waiting' });
    },
    async remove(id: string) {
      const index = jobs.findIndex((job) => job.id === id);
      if (index >= 0) jobs.splice(index, 1);
    },
    async pause() {
      queue.paused = true;
    },
    async resume() {
      queue.paused = false;
    },
    async clean(state: 'completed' | 'failed', graceMs: number) {
      const cutoff = Date.now() - graceMs;
      const doomed = jobs.filter((job) => job.state === state && (job.finishedOn ?? job.timestamp) < cutoff);
      for (const job of doomed) jobs.splice(jobs.indexOf(job), 1);
      return doomed.length;
    }
  };
  return queue;
}

function seedJob(queue: ReturnType<typeof memoryQueue>, job: Partial<StoredJob> & Pick<StoredJob, 'id' | 'state'>) {
  queue.jobs.push({ name: 'email', data: {}, attemptsMade: 0, failedReason: null, timestamp: Date.now(), processedOn: null, finishedOn: null, ...job });
}

const HOUR = 3_600_000;
let notification: ReturnType<typeof memoryQueue>;
let notificationDlq: ReturnType<typeof memoryQueue>;
let outbox: ReturnType<typeof memoryQueue>;
let outboxDlq: ReturnType<typeof memoryQueue>;
let app: FastifyInstance;
const clearedLocks: string[] = [];
const activity: Array<Record<string, unknown>> = [];

beforeEach(async () => {
  audit.length = 0;
  activity.length = 0;
  clearedLocks.length = 0;
  notification = memoryQueue('notification');
  notificationDlq = memoryQueue('dlq-notificationQueue');
  outbox = memoryQueue('outbox');
  outboxDlq = memoryQueue('dlq-outboxQueue');
  const now = Date.now();
  seedJob(notification, { id: 'n1', state: 'waiting' });
  seedJob(notification, { id: 'n2', state: 'waiting' });
  seedJob(notification, { id: 'n3', state: 'active' });
  seedJob(notification, { id: 'n4', state: 'completed', finishedOn: now - 2 * 60_000 });
  seedJob(notification, { id: 'n5', state: 'completed', finishedOn: now - 30 * 60_000 });
  seedJob(notification, { id: 'n6', state: 'completed', finishedOn: now - 3 * HOUR });
  seedJob(notification, { id: 'n7', state: 'failed', finishedOn: now - 10 * 60_000, failedReason: 'SMTP 550', data: { to: 'jane.doe@northwind.test', apiKey: 'fw_live_abcdefghijklmnop', webhookSecret: 'endpoint-signing-secret' } });
  seedJob(notification, { id: 'n8', state: 'failed', finishedOn: now - 30 * HOUR });
  for (let index = 1; index <= 3; index += 1) {
    seedJob(notificationDlq, {
      id: `d${index}`,
      state: 'waiting',
      name: 'notification.dead-letter',
      timestamp: now - index * 1000,
      data: { event: 'shipment.delivered', to: `user${index}@northwind.test`, tenantId: 'tenant_a', queue: 'notification', jobId: `orig_${index}`, jobName: 'email', failedAt: new Date(now).toISOString(), reason: 'SendGrid 500', attemptsMade: 3 }
    });
  }
  seedJob(outboxDlq, { id: 'o1', state: 'waiting', name: 'outbox.publish.failed', data: { outboxEventId: 'evt_1', eventType: 'shipment.created', error: 'redis down' } });

  const entries: QueueEntry[] = [
    { name: 'notification', backend: notification, dlq: { backend: notificationDlq, kind: 'job' }, defaultJobName: 'email' },
    { name: 'outbox', backend: outbox, dlq: { backend: outboxDlq, kind: 'outbox' } },
    { name: 'analytics', backend: memoryQueue('analytics') }
  ];
  app = Fastify();
  app.decorate('prisma', {
    platformActivity: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        const row = { id: `act_${activity.length + 1}`, ...create };
        activity.push(row);
        return row;
      })
    }
  } as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerConsoleQueueRoutes } = await import('./queues.routes.js');
  await registerConsoleQueueRoutes(app, {
    registry: () => entries,
    clearOutboxLock: async (id) => {
      clearedLocks.push(id);
    }
  });
});

afterEach(async () => {
  await app.close();
});

type Summary = { name: string; waiting: number; active: number; delayed: number; completed1h: number; failed1h: number; dlqDepth: number | null; throughputPerMin: number; lastProcessedAt: string | null; paused: boolean };

async function summaries() {
  const response = await app.inject({ method: 'GET', url: '/api/internal/queues' });
  expect(response.statusCode).toBe(200);
  return (response.json() as { queues: Summary[] }).queues;
}

describe('platform.queues (WP-3.6)', () => {
  it('ACC-Q-1 the DLQ column equals the dead-letter queue counts (not the failed count) and rates come from finished jobs', async () => {
    const rows = await summaries();
    const row = rows.find((item) => item.name === 'notification')!;
    expect(row).toMatchObject({ waiting: 2, active: 1, delayed: 0, completed1h: 2, failed1h: 1, dlqDepth: 3, paused: false });
    expect(row.dlqDepth).not.toBe(2); // the queue's own failed set holds 2 jobs
    expect(row.throughputPerMin).toBe(0.2); // 1 completed in the last 5 minutes / 5
    expect(row.lastProcessedAt).toBe(new Date(notification.jobs.find((job) => job.id === 'n4')!.finishedOn!).toISOString());
    expect(rows.find((item) => item.name === 'outbox')!.dlqDepth).toBe(1);
    expect(rows.find((item) => item.name === 'analytics')).toMatchObject({ dlqDepth: null, lastProcessedAt: null, throughputPerMin: 0 });
  });

  it('ACC-Q-2 the jobs endpoint returns real jobs with secrets and emails redacted, paged by cursor', async () => {
    const failed = await app.inject({ method: 'GET', url: '/api/internal/queues/notification/jobs?state=failed' });
    expect(failed.statusCode).toBe(200);
    const body = failed.json() as { data: Array<{ id: string; failedReason: string | null; data: Record<string, unknown> }>; nextCursor: string | null };
    expect(body.data.map((job) => job.id).sort()).toEqual(['n7', 'n8']);
    const n7 = body.data.find((job) => job.id === 'n7')!;
    expect(n7.failedReason).toBe('SMTP 550');
    expect(n7.data.apiKey).toBe('fw_live_****mnop');
    expect(n7.data.webhookSecret).toBe('****');
    expect(JSON.stringify(n7.data)).not.toContain('jane.doe@northwind.test');
    expect(body.nextCursor).toBeNull();

    const dlq = await app.inject({ method: 'GET', url: '/api/internal/queues/notification/jobs?state=dlq' });
    const dlqBody = dlq.json() as { data: Array<{ id: string; name: string; failedReason: string; attemptsMade: number }> };
    expect(dlqBody.data).toHaveLength(3);
    expect(dlqBody.data[0]).toMatchObject({ id: 'd1', name: 'email', failedReason: 'SendGrid 500', attemptsMade: 3 });

    for (let index = 0; index < 60; index += 1) seedJob(notification, { id: `w${index}`, state: 'waiting', timestamp: Date.now() - index });
    const first = (await app.inject({ method: 'GET', url: '/api/internal/queues/notification/jobs?state=waiting' })).json() as { data: unknown[]; nextCursor: string | null };
    expect(first.data).toHaveLength(50);
    expect(first.nextCursor).toBe('50');
    const second = (await app.inject({ method: 'GET', url: '/api/internal/queues/notification/jobs?state=waiting&cursor=50' })).json() as { data: unknown[]; nextCursor: string | null };
    expect(second.data).toHaveLength(12);
    expect(second.nextCursor).toBeNull();

    expect((await app.inject({ method: 'GET', url: '/api/internal/queues/nope/jobs' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/internal/queues/analytics/jobs?state=dlq' })).statusCode).toBe(400);
  });

  it('ACC-Q-3 replay moves N dead-lettered jobs back with their original data and records N in the audit row', async () => {
    const selected = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/dlq/replay', payload: { reason: 'SendGrid outage resolved', jobIds: ['d2'] } });
    expect(selected.statusCode).toBe(200);
    expect(selected.json()).toEqual({ requested: 1, replayed: 1, missing: [] });
    const added = notification.jobs.filter((job) => job.state === 'waiting' && job.name === 'email' && job.data.event === 'shipment.delivered');
    expect(added).toHaveLength(1);
    expect(added[0].data).toEqual({ event: 'shipment.delivered', to: 'user2@northwind.test', tenantId: 'tenant_a' });
    expect(notificationDlq.jobs.map((job) => job.id)).toEqual(['d1', 'd3']);

    const all = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/dlq/replay', payload: { reason: 'SendGrid outage resolved' } });
    expect(all.json()).toEqual({ requested: 2, replayed: 2, missing: [] });
    expect(notificationDlq.jobs).toHaveLength(0);
    expect((await summaries()).find((row) => row.name === 'notification')!.dlqDepth).toBe(0);

    expect(audit).toEqual([
      expect.objectContaining({ action: 'QUEUE_DLQ_REPLAYED', actorId: 'pu_sre', reason: 'SendGrid outage resolved', metadata: expect.objectContaining({ queue: 'notification', requested: 1, replayed: 1, scope: 'selected' }) }),
      expect.objectContaining({ action: 'QUEUE_DLQ_REPLAYED', metadata: expect.objectContaining({ replayed: 2, scope: 'all' }) })
    ]);
    expect(activity).toEqual([
      expect.objectContaining({ service: 'platform.queues', type: 'queue.dlq_replayed', subjectId: 'notification', actorType: 'STAFF' }),
      expect.objectContaining({ type: 'queue.dlq_replayed' })
    ]);

    // Outbox entries: the event row stays unpublished and the poller retries it; replay clears the alert lock.
    const outboxReplay = await app.inject({ method: 'POST', url: '/api/internal/queues/outbox/dlq/replay', payload: { reason: 'Redis failover complete' } });
    expect(outboxReplay.json()).toEqual({ requested: 1, replayed: 1, missing: [] });
    expect(clearedLocks).toEqual(['evt_1']);
    expect(outbox.jobs).toHaveLength(0);
  });

  it('ACC-Q-3 replay is dangerous: 403 without permission, MFA_REQUIRED with stale MFA, REASON_REQUIRED without a reason', async () => {
    const denied = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/dlq/replay', headers: { 'x-test-user': 'pu_reader' }, payload: { reason: 'SendGrid outage resolved' } });
    expect(denied.statusCode).toBe(403);
    const stale = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/dlq/replay', headers: { 'x-test-user': 'pu_stale' }, payload: { reason: 'SendGrid outage resolved' } });
    expect(stale.statusCode).toBe(403);
    expect(stale.json()).toMatchObject({ error: 'MFA_REQUIRED' });
    const noReason = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/dlq/replay', payload: { reason: 'short' } });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json()).toMatchObject({ error: 'REASON_REQUIRED' });
    expect(notificationDlq.jobs).toHaveLength(3);
    expect(audit).toHaveLength(0);
  });

  it('ACC-Q-4 clean removes only jobs in the chosen state older than N hours', async () => {
    const denied = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/clean', headers: { 'x-test-user': 'pu_reader' }, payload: { reason: 'Weekly housekeeping', state: 'failed', olderThanHours: 24 } });
    expect(denied.statusCode).toBe(403);
    const response = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/clean', payload: { reason: 'Weekly housekeeping', state: 'failed', olderThanHours: 24 } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ removed: 1, state: 'failed', olderThanHours: 24 });
    expect(notification.jobs.map((job) => job.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']);
    const completed = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/clean', payload: { reason: 'Weekly housekeeping', state: 'completed', olderThanHours: 1 } });
    expect(completed.json()).toMatchObject({ removed: 1 });
    expect(notification.jobs.map((job) => job.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n7']);
    expect(audit.map((row) => row.action)).toEqual(['QUEUE_CLEANED', 'QUEUE_CLEANED']);
    expect(audit[0]).toMatchObject({ metadata: expect.objectContaining({ state: 'failed', olderThanHours: 24, removed: 1 }) });
    expect((await app.inject({ method: 'POST', url: '/api/internal/queues/notification/clean', payload: { reason: 'Weekly housekeeping', state: 'waiting', olderThanHours: 1 } })).statusCode).toBe(400);
  });

  it('ACC-Q-5 pause and resume are reflected in `paused`', async () => {
    const pause = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/pause', payload: { reason: 'SendGrid incident in progress' } });
    expect(pause.json()).toEqual({ name: 'notification', paused: true });
    expect((await summaries()).find((row) => row.name === 'notification')!.paused).toBe(true);
    const resume = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/resume', payload: { reason: 'SendGrid incident resolved' } });
    expect(resume.json()).toEqual({ name: 'notification', paused: false });
    expect((await summaries()).find((row) => row.name === 'notification')!.paused).toBe(false);
    expect(audit.map((row) => row.action)).toEqual(['QUEUE_PAUSED', 'QUEUE_RESUMED']);
    expect(activity.map((row) => [row.type, row.severity])).toEqual([
      ['queue.paused', 'ATTENTION'],
      ['queue.resumed', 'INFO']
    ]);
  });
});
