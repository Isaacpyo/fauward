import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import { bullQueueBackend, type QueueEntry } from '../../services/queue-operations.service.js';

// Phase 3 golden path against a real Redis (BullMQ): a dead-lettered job shows in the queue list and the DLQ badge,
// replay moves it back to its queue with its original data, and the badge drops. Runs when TEST_REDIS_URL is set
// (CI Redis service, or the VM slot through the tunnel); skipped otherwise. Postgres is not needed for this path.

const REDIS_URL = process.env.TEST_REDIS_URL;
const STAFF: Permission[] = ['platform.queues.read', 'platform.queues.replay', 'platform.queues.purge', 'platform.health.read'];

vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: 'pu_sre', email: 'sre@fauward.com', name: 'SRE', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_sre', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: 'pu_sre' }
    };
  }
}));
vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(STAFF), jit: new Map(), permissions: STAFF }))
}));
const audit = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../services/platform-audit.service.js', () => ({
  writePlatformAuditLog: vi.fn(async (_prisma: unknown, input: Record<string, unknown>) => {
    audit.push(input);
    return { id: `aud_${audit.length}` };
  })
}));
vi.mock('../../queues/queues.js', () => ({}));
vi.mock('../notifications/notifications.worker.js', () => ({}));
vi.mock('../../queues/outbox.worker.js', () => ({}));
vi.mock('../../queues/webhook.worker.js', () => ({}));

describe.runIf(REDIS_URL)('Phase 3 golden path on real Redis: DLQ replay moves the job back and the DLQ badge drops', () => {
  const prefix = `fwtest-${randomUUID().slice(0, 8)}`;
  let redis: Redis;
  let source: Queue;
  let dlq: Queue;
  let app: FastifyInstance;

  beforeAll(async () => {
    const connection = { url: REDIS_URL! };
    redis = new Redis(REDIS_URL!);
    source = new Queue('notification', { connection, prefix });
    dlq = new Queue('dlq-notificationQueue', { connection, prefix });
    const entries: QueueEntry[] = [{ name: 'notification', backend: bullQueueBackend(source), dlq: { backend: bullQueueBackend(dlq), kind: 'job' }, defaultJobName: 'email' }];
    app = Fastify();
    app.decorate('prisma', { platformActivity: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'act', ...create })) } } as never);
    app.decorate('redis', redis as never);
    const { registerConsoleQueueRoutes } = await import('./platform/queues.routes.js');
    const { registerConsoleBadgeRoutes } = await import('./shell/badges.routes.js');
    await registerConsoleQueueRoutes(app, { registry: () => entries, clearOutboxLock: async () => undefined });
    await registerConsoleBadgeRoutes(app, { queues: () => entries });
  });

  afterAll(async () => {
    await app?.close();
    await source?.obliterate({ force: true }).catch(() => undefined);
    await dlq?.obliterate({ force: true }).catch(() => undefined);
    await source?.close();
    await dlq?.close();
    await redis?.quit();
  });

  it('dead-lettered → listed with redacted data → replayed to the source queue → badge drops; pause/resume and clean act on the real queue', async () => {
    // Two jobs dead-lettered the way the notification worker does it (original data + metadata).
    for (const [index, to] of ['ada@northwind.test', 'grace@northwind.test'].entries()) {
      await dlq.add('notification.dead-letter', { event: 'shipment.delivered', to, tenantId: 'tenant_a', queue: 'notification', jobId: `orig_${index}`, jobName: 'email', failedAt: new Date().toISOString(), reason: 'SendGrid 500', attemptsMade: 3 });
    }

    const badgesBefore = (await app.inject({ method: 'GET', url: '/api/internal/badges' })).json() as Record<string, { value: number; tone: string }>;
    expect(badgesBefore['dlq-depth']).toMatchObject({ value: 2, tone: 'red' });
    const listed = (await app.inject({ method: 'GET', url: '/api/internal/queues' })).json() as { queues: Array<{ name: string; dlqDepth: number; waiting: number }> };
    expect(listed.queues[0]).toMatchObject({ name: 'notification', dlqDepth: 2, waiting: 0 });

    const jobs = (await app.inject({ method: 'GET', url: '/api/internal/queues/notification/jobs?state=dlq' })).json() as { data: Array<{ id: string; name: string; data: { to: string } }> };
    expect(jobs.data).toHaveLength(2);
    expect(jobs.data.every((job) => job.name === 'email' && !job.data.to.includes('ada@') && !job.data.to.includes('grace@'))).toBe(true);

    const replay = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/dlq/replay', payload: { reason: 'SendGrid outage resolved', jobIds: [jobs.data[0].id] } });
    expect(replay.json()).toEqual({ requested: 1, replayed: 1, missing: [] });
    const waiting = await source.getJobs(['waiting'], 0, 10);
    expect(waiting).toHaveLength(1);
    expect(waiting[0].name).toBe('email');
    expect(Object.keys(waiting[0].data).sort()).toEqual(['event', 'tenantId', 'to']);
    expect(audit.at(-1)).toMatchObject({ action: 'QUEUE_DLQ_REPLAYED', metadata: expect.objectContaining({ replayed: 1 }) });

    const badgesAfter = (await app.inject({ method: 'GET', url: '/api/internal/badges' })).json() as Record<string, { value: number }>;
    expect(badgesAfter['dlq-depth'].value).toBe(1);
    expect(((await app.inject({ method: 'GET', url: '/api/internal/queues' })).json() as { queues: Array<{ dlqDepth: number; waiting: number }> }).queues[0]).toMatchObject({ dlqDepth: 1, waiting: 1 });

    expect((await app.inject({ method: 'POST', url: '/api/internal/queues/notification/pause', payload: { reason: 'Provider incident drill' } })).json()).toEqual({ name: 'notification', paused: true });
    expect(await source.isPaused()).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/internal/queues/notification/resume', payload: { reason: 'Provider incident drill over' } })).json()).toEqual({ name: 'notification', paused: false });
    expect(await source.isPaused()).toBe(false);

    const clean = await app.inject({ method: 'POST', url: '/api/internal/queues/notification/clean', payload: { reason: 'Weekly housekeeping', state: 'failed', olderThanHours: 1 } });
    expect(clean.json()).toMatchObject({ removed: 0, state: 'failed' });
  });

  it('request metrics written by one recorder are read back as percentiles from Redis', async () => {
    const { RequestMetricsRecorder, readRequestMetrics, minuteKey, minuteOf } = await import('../../services/metrics/request-metrics.js');
    const now = Date.now();
    const recorder = new RequestMetricsRecorder({ redis, log: { error: vi.fn() } });
    const group = `/api/${prefix}/golden`;
    for (let index = 0; index < 19; index += 1) recorder.record(group, 40, 200, now);
    recorder.record(group, 2_500, 503, now);
    await recorder.flush();
    const report = await readRequestMetrics(redis, { minutes: 1, now });
    expect(report?.routes.find((route) => route.group === group)).toMatchObject({ count: 20, p50: 50, p95: 50, p99: 3000, errorRate5xx: 0.05 });
    // The minute hash expires (24 h retention) rather than accumulating forever.
    expect(await redis.ttl(minuteKey(minuteOf(now)))).toBeGreaterThan(0);
  });
});
