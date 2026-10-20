import type { FastifyInstance } from 'fastify';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { readRequestMetrics } from '../../../services/metrics/request-metrics.js';
import { readWorkerHeartbeats } from '../../../services/metrics/worker-heartbeat.js';
import { summariseQueue } from '../../../services/queue-operations.service.js';
import { defaultQueueRegistry, type QueueRegistry } from './queues.routes.js';

// platform.health (WP-3.7). Every field is measured; anything that cannot be measured says why (`unavailable`), never
// a placeholder. HTTP figures cover the last 15 minutes across every API instance (Redis minute buckets).

export const HEALTH_WINDOW_MINUTES = 15;

type Unavailable = { unavailable: true; reason: string };

async function timed<T>(fn: () => Promise<T>) {
  const started = Date.now();
  try {
    await fn();
    return { latencyMs: Date.now() - started };
  } catch (err: unknown) {
    return { unavailable: true as const, reason: err instanceof Error ? err.message : 'Check failed' };
  }
}

export async function buildHealthReport(app: FastifyInstance, registry: QueueRegistry, now = Date.now()) {
  const [db, redis] = await Promise.all([timed(() => app.prisma.$queryRaw`SELECT 1`), timed(() => app.redis.ping())]);

  let http: Awaited<ReturnType<typeof readRequestMetrics>> | Unavailable;
  let workers: Awaited<ReturnType<typeof readWorkerHeartbeats>> | Unavailable;
  try {
    http = (await readRequestMetrics(app.redis, { minutes: HEALTH_WINDOW_MINUTES, now })) ?? { unavailable: true, reason: `No API requests recorded in the last ${HEALTH_WINDOW_MINUTES} minutes` };
  } catch (err: unknown) {
    app.log.warn({ err }, 'Request metrics unavailable');
    http = { unavailable: true, reason: 'Request metrics could not be read from Redis' };
  }
  try {
    workers = await readWorkerHeartbeats(app.redis, now);
  } catch (err: unknown) {
    app.log.warn({ err }, 'Worker heartbeats unavailable');
    workers = { unavailable: true, reason: 'Worker heartbeats could not be read from Redis' };
  }

  let queuesSummary: { queues: number; waiting: number; active: number; failed1h: number; dlqDepth: number; paused: number } | Unavailable;
  try {
    const queues = await Promise.all(registry().map((entry) => summariseQueue(entry, now)));
    queuesSummary = {
      queues: queues.length,
      waiting: queues.reduce((sum, queue) => sum + queue.waiting, 0),
      active: queues.reduce((sum, queue) => sum + queue.active, 0),
      failed1h: queues.reduce((sum, queue) => sum + queue.failed1h, 0),
      dlqDepth: queues.reduce((sum, queue) => sum + (queue.dlqDepth ?? 0), 0),
      paused: queues.filter((queue) => queue.paused).length
    };
  } catch (err: unknown) {
    app.log.warn({ err }, 'Queue summary unavailable');
    queuesSummary = { unavailable: true, reason: 'BullMQ queues could not be read' };
  }

  const version = process.env.APP_VERSION ?? null;
  const commit = process.env.GIT_COMMIT ?? null;
  return {
    asOf: new Date(now).toISOString(),
    windowMinutes: HEALTH_WINDOW_MINUTES,
    db,
    redis,
    uptimeSeconds: Math.floor(process.uptime()),
    version: version || commit ? { version, commit } : { unavailable: true as const, reason: 'APP_VERSION and GIT_COMMIT are not set on this deployment' },
    http: 'unavailable' in http ? http : http.http,
    routes: 'unavailable' in http ? [] : http.routes.slice(0, 10),
    workers,
    queuesSummary
  };
}

export async function registerConsoleHealthRoutes(app: FastifyInstance, options: { registry?: QueueRegistry } = {}) {
  const registry = options.registry ?? defaultQueueRegistry;
  app.get('/api/internal/health', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.health.read')] }, async (_request, reply) => {
    return reply.send(await buildHealthReport(app, registry));
  });
}
