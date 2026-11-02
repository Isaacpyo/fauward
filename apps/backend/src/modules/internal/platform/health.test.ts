import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

// platform.health (WP-3.7): request metrics (Redis minute buckets), worker heartbeats and the /health report.

const STAFF: Record<string, Permission[]> = { pu_sre: ['platform.health.read'], pu_csm: ['customer.360.read'] };

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { headers: Record<string, unknown>; platform?: unknown }) => {
    const id = String(request.headers['x-test-user'] ?? 'pu_sre');
    request.platform = { user: { id, email: `${id}@fauward.com`, name: null, status: 'ACTIVE', mfaEnabled: true }, session: { id: `ps_${id}`, mfaVerifiedAt: new Date() }, claims: { sub: id } };
  }
}));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async (_prisma: unknown, user: { id: string }) => ({ staff: null, roles: [], rolePermissions: new Set(STAFF[user.id]), jit: new Map(), permissions: STAFF[user.id] }))
}));
vi.mock('../../../queues/queues.js', () => ({}));
vi.mock('../../notifications/notifications.worker.js', () => ({}));
vi.mock('../../../queues/outbox.worker.js', () => ({}));
vi.mock('../../../queues/webhook.worker.js', () => ({}));

/** Just enough of ioredis for the metrics and heartbeat code: hashes, strings with TTL, pipelines. */
function memoryRedis(clock: () => number) {
  const hashes = new Map<string, Map<string, number>>();
  const strings = new Map<string, { value: string; expiresAt: number | null }>();
  const live = (key: string) => {
    const entry = strings.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= clock()) strings.delete(key);
    return strings.get(key) ?? null;
  };
  const redis = {
    hashes,
    pipeline() {
      const ops: Array<() => void> = [];
      const chain = {
        hincrby(key: string, field: string, value: number) {
          ops.push(() => {
            const hash = hashes.get(key) ?? new Map<string, number>();
            hash.set(field, (hash.get(field) ?? 0) + value);
            hashes.set(key, hash);
          });
          return chain;
        },
        expire() {
          return chain;
        },
        async exec() {
          for (const op of ops) op();
          return [];
        }
      };
      return chain;
    },
    async hgetall(key: string) {
      return Object.fromEntries([...(hashes.get(key) ?? new Map<string, number>())].map(([field, value]) => [field, String(value)]));
    },
    async set(key: string, value: string, _ex: 'EX', seconds: number) {
      strings.set(key, { value, expiresAt: clock() + seconds * 1000 });
      return 'OK';
    },
    async mget(...keys: string[]) {
      return keys.map((key) => live(key)?.value ?? null);
    },
    async ping() {
      return 'PONG';
    }
  };
  return redis;
}

const apps: FastifyInstance[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function buildApp(redis: ReturnType<typeof memoryRedis>) {
  const app = Fastify();
  apps.push(app);
  app.decorate('prisma', { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) } as never);
  app.decorate('redis', redis as never);
  const { registerConsoleHealthRoutes } = await import('./health.routes.js');
  await registerConsoleHealthRoutes(app, { registry: () => [] });
  return app;
}

describe('request metrics (WP-3.7)', () => {
  it('ACC-HLTH-1 p95 matches the recorded fixture durations, per route group and overall', async () => {
    const now = Date.UTC(2026, 9, 20, 10, 0, 30);
    const redis = memoryRedis(() => now);
    const { RequestMetricsRecorder, readRequestMetrics, routeGroup } = await import('../../../services/metrics/request-metrics.js');
    const recorder = new RequestMetricsRecorder({ redis: redis as never, log: { error: vi.fn() }, now: () => now });

    // 100 shipment requests: 90 × 40 ms, 5 × 180 ms, 5 × 900 ms (two of them 5xx) → p50 50, p95 200, p99 1000.
    const shipments = routeGroup('/api/v1/shipments/:id');
    for (let index = 0; index < 90; index += 1) recorder.record(shipments, 40, 200, now - 60_000);
    for (let index = 0; index < 5; index += 1) recorder.record(shipments, 180, 200);
    for (let index = 0; index < 5; index += 1) recorder.record(shipments, 900, index < 2 ? 503 : 200);
    // 20 health checks at 3 ms.
    for (let index = 0; index < 20; index += 1) recorder.record(routeGroup('/health'), 3, 200);
    // Older than the 15-minute window: ignored.
    recorder.record(shipments, 9_000, 500, now - 20 * 60_000);
    await recorder.flush();

    expect(shipments).toBe('/api/v1/shipments');
    expect(routeGroup(undefined)).toBe('unmatched');
    const report = await readRequestMetrics(redis as never, { minutes: 15, now });
    expect(report).not.toBeNull();
    const byGroup = Object.fromEntries(report!.routes.map((route) => [route.group, route]));
    expect(byGroup['/api/v1/shipments']).toMatchObject({ count: 100, p50: 50, p95: 200, p99: 1000, errorRate5xx: 0.02 });
    expect(byGroup['/health']).toMatchObject({ count: 20, p50: 5, p95: 5, p99: 5, errorRate5xx: 0 });
    expect(report!.http).toMatchObject({ count: 120, p95: 200, errorRate5xx: Math.round((2 / 120) * 10_000) / 10_000, rpm: 8 });
    expect(report!.routes[0].group).toBe('/api/v1/shipments'); // sorted by p95
  });

  it('ACC-HLTH-1 /health reports the http figures and the top routes from the buckets', async () => {
    const redis = memoryRedis(() => Date.now());
    const { RequestMetricsRecorder } = await import('../../../services/metrics/request-metrics.js');
    const recorder = new RequestMetricsRecorder({ redis: redis as never, log: { error: vi.fn() } });
    for (let index = 0; index < 19; index += 1) recorder.record('/api/v1/shipments', 40, 200);
    recorder.record('/api/v1/shipments', 2_500, 500);
    await recorder.flush();
    const app = await buildApp(redis);
    const response = await app.inject({ method: 'GET', url: '/api/internal/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { http: { p95: number; p99: number; errorRate5xx: number; count: number }; routes: Array<{ group: string }>; db: { latencyMs: number }; redis: { latencyMs: number } };
    expect(body.http).toMatchObject({ count: 20, p95: 50, p99: 3000, errorRate5xx: 0.05 });
    expect(body.routes.map((route) => route.group)).toEqual(['/api/v1/shipments']);
    expect(typeof body.db.latencyMs).toBe('number');
    expect(typeof body.redis.latencyMs).toBe('number');
    expect((await app.inject({ method: 'GET', url: '/api/internal/health', headers: { 'x-test-user': 'pu_csm' } })).statusCode).toBe(403);
  });
});

describe('worker heartbeats (WP-3.7)', () => {
  it('ACC-HLTH-2 a worker with no heartbeat for 60 s shows alive: false; one that beats shows alive: true', async () => {
    let clock = Date.UTC(2026, 9, 20, 10, 0, 0);
    const redis = memoryRedis(() => clock);
    const { beat, readWorkerHeartbeats, KNOWN_WORKERS } = await import('../../../services/metrics/worker-heartbeat.js');
    const deps = { redis: redis as never, log: { error: vi.fn() }, now: () => clock };
    await beat(deps, 'notification');
    await beat(deps, 'webhook');

    clock += 40_000;
    await beat(deps, 'webhook');
    let workers = await readWorkerHeartbeats(redis as never, clock);
    expect(workers.map((worker) => worker.name)).toEqual([...KNOWN_WORKERS]);
    expect(workers.find((worker) => worker.name === 'notification')).toMatchObject({ alive: true });

    clock += 21_000; // notification last beat 61 s ago: its key expired
    workers = await readWorkerHeartbeats(redis as never, clock);
    expect(workers.find((worker) => worker.name === 'notification')).toEqual({ name: 'notification', alive: false, lastBeat: null });
    expect(workers.find((worker) => worker.name === 'webhook')).toMatchObject({ alive: true, lastBeat: new Date(clock - 21_000).toISOString() });
    expect(workers.find((worker) => worker.name === 'agent')).toEqual({ name: 'agent', alive: false, lastBeat: null });
  });

  it('ACC-HLTH-2 a worker whose probe says it is not running stops beating', async () => {
    vi.useFakeTimers();
    const redis = memoryRedis(() => Date.now());
    const { startWorkerHeartbeat, heartbeatKey } = await import('../../../services/metrics/worker-heartbeat.js');
    let running = true;
    const set = vi.spyOn(redis, 'set');
    const stop = startWorkerHeartbeat({ redis: redis as never, log: { error: vi.fn() } }, 'analytics', () => running);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toBe(heartbeatKey('analytics'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(set).toHaveBeenCalledTimes(2);
    running = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(set).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('/health report (WP-3.7)', () => {
  it('ACC-HLTH-3 nothing is a placeholder: unmeasurable fields say why', async () => {
    const redis = memoryRedis(() => Date.now());
    const previous = { version: process.env.APP_VERSION, commit: process.env.GIT_COMMIT };
    delete process.env.APP_VERSION;
    delete process.env.GIT_COMMIT;
    try {
      const app = await buildApp(redis);
      const body = (await app.inject({ method: 'GET', url: '/api/internal/health' })).json() as Record<string, unknown>;
      expect(body.http).toEqual({ unavailable: true, reason: 'No API requests recorded in the last 15 minutes' });
      expect(body.version).toEqual({ unavailable: true, reason: 'APP_VERSION and GIT_COMMIT are not set on this deployment' });
      expect(body.routes).toEqual([]);
      expect(body.queuesSummary).toEqual({ queues: 0, waiting: 0, active: 0, failed1h: 0, dlqDepth: 0, paused: 0 });
      expect(JSON.stringify(body)).not.toMatch(/"-"|placeholder/i);

      const broken = { ...redis, hgetall: vi.fn(async () => Promise.reject(new Error('READONLY'))), mget: vi.fn(async () => Promise.reject(new Error('READONLY'))) };
      const degraded = await buildApp(broken as never);
      const report = (await degraded.inject({ method: 'GET', url: '/api/internal/health' })).json() as Record<string, unknown>;
      expect(report.http).toEqual({ unavailable: true, reason: 'Request metrics could not be read from Redis' });
      expect(report.workers).toEqual({ unavailable: true, reason: 'Worker heartbeats could not be read from Redis' });
    } finally {
      if (previous.version !== undefined) process.env.APP_VERSION = previous.version;
      if (previous.commit !== undefined) process.env.GIT_COMMIT = previous.commit;
    }
  });
});
