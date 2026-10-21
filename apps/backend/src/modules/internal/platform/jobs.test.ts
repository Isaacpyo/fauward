import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import { tenantStorage } from '../../../context/tenant.context.js';

// platform.jobs (WP-3.8): registry, ScheduledJobRun rows, console list/history/trigger.

const STAFF: Record<string, { permissions: Permission[]; mfaAgeMs?: number }> = {
  pu_ops: { permissions: ['platform.jobs.read', 'platform.jobs.trigger'] },
  pu_reader: { permissions: ['platform.jobs.read'] },
  pu_stale: { permissions: ['platform.jobs.read', 'platform.jobs.trigger'], mfaAgeMs: 60 * 60_000 }
};

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { headers: Record<string, unknown>; platform?: unknown }) => {
    const id = String(request.headers['x-test-user'] ?? 'pu_ops');
    request.platform = {
      user: { id, email: `${id}@fauward.com`, name: 'Ops', status: 'ACTIVE', mfaEnabled: true },
      session: { id: `ps_${id}`, mfaVerifiedAt: new Date(Date.now() - (STAFF[id].mfaAgeMs ?? 0)), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: id }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async (_prisma: unknown, user: { id: string }) => ({ staff: null, roles: [], rolePermissions: new Set(STAFF[user.id].permissions), jit: new Map(), permissions: STAFF[user.id].permissions }))
}));
const audit = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../services/platform-audit.service.js', () => ({
  writePlatformAuditLog: vi.fn(async (_prisma: unknown, input: Record<string, unknown>) => {
    audit.push(input);
    return { id: `aud_${audit.length}` };
  })
}));
const repeatAdds = vi.hoisted(() => [] as Array<{ name: string; opts: { jobId: string; repeat?: { pattern: string } } }>);
vi.mock('../../../queues/queues.js', () => ({
  bullmqConnection: {},
  scheduledJobsQueue: {
    add: vi.fn(async (name: string, _data: unknown, opts: { jobId: string; repeat?: { pattern: string } }) => {
      repeatAdds.push({ name, opts });
      return { id: opts.jobId };
    })
  }
}));
vi.mock('bullmq', () => ({ Worker: class {}, Queue: class {} }));

type Run = { id: string; jobName: string; bullJobId: string | null; status: string; triggeredBy: string; reason: string | null; startedAt: Date; finishedAt: Date | null; durationMs: number | null; error: string | null; result: unknown };

function createStore() {
  const runs: Run[] = [];
  const activity: Array<Record<string, unknown>> = [];
  const contexts: unknown[] = [];
  let seq = 0;
  const prisma = {
    scheduledJobRun: {
      create: vi.fn(async ({ data }: { data: Omit<Run, 'id' | 'finishedAt' | 'durationMs' | 'error' | 'result'> }) => {
        contexts.push(tenantStorage.getStore());
        seq += 1;
        const row: Run = { id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, finishedAt: null, durationMs: null, error: null, result: null, ...data };
        runs.push(row);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Run> }) => {
        const row = runs.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      findMany: vi.fn(async ({ where, distinct, take, cursor }: { where: { jobName: string | { in: string[] } }; distinct?: string[]; take?: number; cursor?: { id: string } }) => {
        let list = runs
          .filter((run) => (typeof where.jobName === 'string' ? run.jobName === where.jobName : where.jobName.in.includes(run.jobName)))
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id.localeCompare(a.id));
        if (distinct) list = list.filter((run, index) => list.findIndex((other) => other.jobName === run.jobName) === index);
        if (cursor) list = list.slice(list.findIndex((run) => run.id === cursor.id) + 1);
        return take ? list.slice(0, take) : list;
      })
    },
    platformActivity: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        const row = { id: `act_${activity.length + 1}`, ...create };
        activity.push(row);
        return row;
      })
    }
  };
  return { runs, activity, contexts, prisma };
}

let store: ReturnType<typeof createStore>;
const apps: FastifyInstance[] = [];
const queued: Array<{ name: string; data: Record<string, unknown>; opts: { jobId: string } }> = [];
const queue = {
  add: vi.fn(async (name: string, data: Record<string, unknown>, opts: { jobId: string }) => {
    queued.push({ name, data, opts });
    return { id: opts.jobId };
  }),
  getRepeatableJobs: vi.fn(async () => [{ key: 'k', name: 'platform.activity-prune', id: 'platform.activity-prune', pattern: '40 3 * * *', tz: 'UTC', endDate: null, next: Date.UTC(2026, 9, 21, 3, 40) }])
};

function workerApp() {
  return { prisma: store.prisma, redis: { publish: vi.fn(async () => 1) }, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as unknown as FastifyInstance;
}

async function buildApp(jobs?: () => import('../../../queues/scheduled-job-runner.js').ScheduledJobDefinition[]) {
  const app = Fastify();
  apps.push(app);
  app.decorate('prisma', store.prisma as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerConsoleJobRoutes } = await import('./jobs.routes.js');
  await registerConsoleJobRoutes(app, { queue: queue as never, ...(jobs ? { jobs } : {}) });
  return app;
}

beforeEach(() => {
  store = createStore();
  audit.length = 0;
  queued.length = 0;
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('platform.jobs (WP-3.8)', () => {
  it('ACC-JOB-1 the list equals the registered jobs, with cron, next run and last run', async () => {
    const { listScheduledJobs } = await import('../../../queues/scheduled-job-runner.js');
    const { registerScheduledJobs } = await import('../../../queues/scheduled.worker.js');
    await registerScheduledJobs();
    const registered = listScheduledJobs().map((job) => job.name).sort();
    // Every definition is also a BullMQ repeatable with the same cron (and the repeat ids did not change).
    expect(repeatAdds.filter((add) => add.opts.repeat).map((add) => add.name).sort()).toEqual(registered);
    // trust.secret-inventory also runs once at boot (WP-4.12), as a one-off job.
    expect(repeatAdds.filter((add) => !add.opts.repeat).map((add) => add.name)).toEqual(['trust.secret-inventory']);
    expect(repeatAdds.find((add) => add.name === 'customer.health-scoring')?.opts).toMatchObject({ jobId: 'customer.health-scoring.nightly', repeat: { pattern: '30 1 * * *' } });
    expect(registered).toContain('platform.activity-prune');

    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/api/internal/jobs' })).json() as { data: Array<{ name: string; pattern: string; nextRunAt: string | null; scheduled: boolean | null; lastRun: unknown }> };
    expect(body.data.map((job) => job.name)).toEqual(registered);
    const prune = body.data.find((job) => job.name === 'platform.activity-prune')!;
    expect(prune).toMatchObject({ pattern: '40 3 * * *', scheduled: true, nextRunAt: '2026-10-21T03:40:00.000Z', lastRun: null });
    expect(body.data.find((job) => job.name === 'idempotency.cleanup')).toMatchObject({ scheduled: false, nextRunAt: null });
    expect((await app.inject({ method: 'GET', url: '/api/internal/jobs/not-a-job/runs' })).statusCode).toBe(404);
  });

  it('ACC-JOB-2 every run writes a ScheduledJobRun row with status and duration, in system context', async () => {
    const { registerScheduledJob, runScheduledJob } = await import('../../../queues/scheduled-job-runner.js');
    const definition = registerScheduledJob({
      name: 'test.fast',
      pattern: '* * * * *',
      repeatJobId: 'test.fast',
      description: 'fixture',
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { processed: 3 };
      }
    });
    await runScheduledJob(workerApp(), definition, { bullJobId: 'repeat:1' });
    await runScheduledJob(workerApp(), definition, { bullJobId: 'repeat:2' });
    expect(store.runs).toHaveLength(2);
    for (const run of store.runs) {
      expect(run).toMatchObject({ jobName: 'test.fast', status: 'SUCCEEDED', triggeredBy: 'SCHEDULE', result: { processed: 3 } });
      expect(run.durationMs).toBeGreaterThanOrEqual(15);
      expect(run.finishedAt).toBeInstanceOf(Date);
    }
    expect(store.contexts.every((ctx) => (ctx as { isSuperAdmin?: boolean }).isSuperAdmin === true)).toBe(true);

    const app = await buildApp(() => [definition]);
    const history = (await app.inject({ method: 'GET', url: '/api/internal/jobs/test.fast/runs?limit=1' })).json() as { data: Array<{ bullJobId: string }>; nextCursor: string | null };
    expect(history.data).toHaveLength(1);
    expect(history.nextCursor).not.toBeNull();
    const next = (await app.inject({ method: 'GET', url: `/api/internal/jobs/test.fast/runs?limit=1&cursor=${history.nextCursor}` })).json() as { data: Array<{ bullJobId: string }> };
    expect([history.data[0].bullJobId, next.data[0].bullJobId].sort()).toEqual(['repeat:1', 'repeat:2']);
  });

  it('ACC-JOB-3 a failing job records its error (and a timed-out one TIMED_OUT) and the list shows it', async () => {
    const { registerScheduledJob, runScheduledJob } = await import('../../../queues/scheduled-job-runner.js');
    const failing = registerScheduledJob({ name: 'test.failing', pattern: '0 * * * *', repeatJobId: 'test.failing', description: 'fixture', handler: async () => Promise.reject(new Error('Carrier API returned 502')) });
    const slow = registerScheduledJob({ name: 'test.slow', pattern: '0 * * * *', repeatJobId: 'test.slow', description: 'fixture', timeoutMs: 10, handler: () => new Promise((resolve) => setTimeout(() => resolve({ late: true }), 200)) });
    await expect(runScheduledJob(workerApp(), failing)).rejects.toThrow('Carrier API returned 502');
    await expect(runScheduledJob(workerApp(), slow)).rejects.toThrow('did not finish');
    expect(store.runs.find((run) => run.jobName === 'test.failing')).toMatchObject({ status: 'FAILED', error: 'Carrier API returned 502' });
    expect(store.runs.find((run) => run.jobName === 'test.slow')).toMatchObject({ status: 'TIMED_OUT' });
    expect(store.activity).toEqual([
      expect.objectContaining({ service: 'platform.jobs', type: 'job.failed', subjectId: 'test.failing', severity: 'ATTENTION' }),
      expect.objectContaining({ type: 'job.failed', subjectId: 'test.slow' })
    ]);

    const app = await buildApp(() => [failing, slow]);
    const list = (await app.inject({ method: 'GET', url: '/api/internal/jobs' })).json() as { data: Array<{ name: string; lastRun: { status: string; error: string | null } }> };
    expect(list.data.find((job) => job.name === 'test.failing')!.lastRun).toMatchObject({ status: 'FAILED', error: 'Carrier API returned 502' });
  });

  it('ACC-JOB-4 a manual trigger is dangerous, queues the job and the run records actor and reason', async () => {
    const { registerScheduledJob } = await import('../../../queues/scheduled-job-runner.js');
    const handler = vi.fn(async () => ({ swept: 2 }));
    const definition = registerScheduledJob({ name: 'test.manual', pattern: '0 0 * * *', repeatJobId: 'test.manual', description: 'fixture', handler });
    const app = await buildApp(() => [definition]);

    const denied = await app.inject({ method: 'POST', url: '/api/internal/jobs/test.manual/trigger', headers: { 'x-test-user': 'pu_reader' }, payload: { reason: 'Re-run after the outage' } });
    expect(denied.statusCode).toBe(403);
    const stale = await app.inject({ method: 'POST', url: '/api/internal/jobs/test.manual/trigger', headers: { 'x-test-user': 'pu_stale' }, payload: { reason: 'Re-run after the outage' } });
    expect(stale.json()).toMatchObject({ error: 'MFA_REQUIRED' });
    expect((await app.inject({ method: 'POST', url: '/api/internal/jobs/test.manual/trigger', payload: { reason: 'now' } })).json()).toMatchObject({ error: 'REASON_REQUIRED' });
    expect(queued).toHaveLength(0);

    const response = await app.inject({ method: 'POST', url: '/api/internal/jobs/test.manual/trigger', payload: { reason: 'Re-run after the outage' } });
    expect(response.statusCode).toBe(202);
    expect(queued).toEqual([{ name: 'test.manual', data: { triggeredBy: 'pu_ops', reason: 'Re-run after the outage' }, opts: { jobId: expect.stringMatching(/^manual-test\.manual-/) } }]);
    expect(audit).toEqual([expect.objectContaining({ action: 'SCHEDULED_JOB_TRIGGERED', actorId: 'pu_ops', reason: 'Re-run after the outage', metadata: expect.objectContaining({ jobName: 'test.manual' }) })]);
    expect(store.activity).toEqual([expect.objectContaining({ service: 'platform.jobs', type: 'job.triggered', actorType: 'STAFF', subjectId: 'test.manual' })]);

    // The worker picks the job up: the run row carries the actor and reason.
    const { processScheduledJob } = await import('../../../queues/scheduled.worker.js');
    await processScheduledJob(workerApp(), { id: queued[0].opts.jobId, name: queued[0].name, data: queued[0].data });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(store.runs).toEqual([expect.objectContaining({ jobName: 'test.manual', status: 'SUCCEEDED', triggeredBy: 'pu_ops', reason: 'Re-run after the outage', bullJobId: queued[0].opts.jobId, result: { swept: 2 } })]);
  });
});
