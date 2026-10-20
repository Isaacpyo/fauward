import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { defaultQueueRegistry, type QueueRegistry } from '../../../services/queue-registry.js';
import { writePlatformAuditLog } from '../../../services/platform-audit.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { listQueueJobs, replayDeadLetters, summariseQueue, type QueueListState } from '../../../services/queue-operations.service.js';
import { platformAuditActor, reasonOf } from '../request-meta.js';

// platform.queues (WP-3.6). Counts come from BullMQ, the DLQ column from the dead-letter queues, jobs are redacted.

export { defaultQueueRegistry, type QueueRegistry };

const jobsQuery = z.object({
  state: z.enum(['waiting', 'active', 'delayed', 'completed', 'failed', 'dlq']).default('failed'),
  cursor: z.coerce.number().int().min(0).default(0)
});
const replayBody = z.object({ reason: z.string(), jobIds: z.array(z.string().min(1)).max(500).optional() });
const cleanBody = z.object({ reason: z.string(), state: z.enum(['completed', 'failed']), olderThanHours: z.coerce.number().int().min(1).max(24 * 90) });
const actionBody = z.object({ reason: z.string() });

type ActionInput = {
  action: string;
  type: string;
  queue: string;
  summary: string;
  metadata: Record<string, string | number | boolean | string[] | null>;
  severity?: 'INFO' | 'ATTENTION' | 'CRITICAL';
};

export async function registerConsoleQueueRoutes(app: FastifyInstance, options: { registry?: QueueRegistry; clearOutboxLock?: (id: string) => Promise<void> } = {}) {
  const registry = options.registry ?? defaultQueueRegistry;
  const clearOutboxLock =
    options.clearOutboxLock ??
    (async (outboxEventId: string) => {
      await app.redis.del(`dlq:outbox:event:${outboxEventId}`);
    });

  function findQueue(request: FastifyRequest, reply: FastifyReply) {
    const { name } = request.params as { name: string };
    const entry = registry().find((item) => item.name === name);
    if (!entry) {
      reply.status(404).send({ error: 'QUEUE_NOT_FOUND', message: `No queue named ${name}` });
      return null;
    }
    return entry;
  }

  async function record(request: FastifyRequest, input: ActionInput) {
    const reason = reasonOf(request) ?? '';
    await writePlatformAuditLog(app.prisma, {
      ...platformAuditActor(request),
      actorType: 'PLATFORM_USER',
      action: input.action,
      reason,
      metadata: { queue: input.queue, ...input.metadata }
    });
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: app.log },
      {
        service: 'platform.queues',
        type: input.type,
        ...staffActor(request),
        subjectType: 'queue',
        subjectId: input.queue,
        summary: `${input.summary}: ${reason}`,
        severity: input.severity ?? 'INFO',
        consoleLink: `/platform/queues/${encodeURIComponent(input.queue)}`,
        metadata: { queue: input.queue, ...input.metadata }
      }
    );
  }

  app.get('/api/internal/queues', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.queues.read')] }, async (_request, reply) => {
    const now = Date.now();
    const queues = await Promise.all(registry().map((entry) => summariseQueue(entry, now)));
    return reply.send({ queues, asOf: new Date(now).toISOString() });
  });

  app.get('/api/internal/queues/:name/jobs', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.queues.read')] }, async (request, reply) => {
    const parsed = jobsQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const entry = findQueue(request, reply);
    if (!entry) return reply;
    if (parsed.data.state === 'dlq' && !entry.dlq) return reply.status(400).send({ error: 'NO_DLQ', message: `${entry.name} has no dead-letter queue` });
    return reply.send(await listQueueJobs(entry, parsed.data.state as QueueListState, parsed.data.cursor));
  });

  app.post('/api/internal/queues/:name/dlq/replay', { preHandler: dangerous('platform.queues.replay') }, async (request, reply) => {
    const parsed = replayBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    const entry = findQueue(request, reply);
    if (!entry) return reply;
    if (!entry.dlq) return reply.status(400).send({ error: 'NO_DLQ', message: `${entry.name} has no dead-letter queue` });
    const result = await replayDeadLetters(entry, parsed.data.jobIds, { clearOutboxLock });
    await record(request, {
      action: 'QUEUE_DLQ_REPLAYED',
      type: 'queue.dlq_replayed',
      queue: entry.name,
      summary: `${result.replayed} dead-lettered ${entry.name} job(s) replayed`,
      metadata: { requested: result.requested, replayed: result.replayed, missing: result.missing, scope: parsed.data.jobIds?.length ? 'selected' : 'all' }
    });
    return reply.send(result);
  });

  app.post('/api/internal/queues/:name/clean', { preHandler: dangerous('platform.queues.purge') }, async (request, reply) => {
    const parsed = cleanBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    const entry = findQueue(request, reply);
    if (!entry) return reply;
    const removed = await entry.backend.clean(parsed.data.state, parsed.data.olderThanHours * 3_600_000);
    await record(request, {
      action: 'QUEUE_CLEANED',
      type: 'queue.cleaned',
      queue: entry.name,
      summary: `${removed} ${parsed.data.state} ${entry.name} job(s) older than ${parsed.data.olderThanHours} h removed`,
      metadata: { state: parsed.data.state, olderThanHours: parsed.data.olderThanHours, removed }
    });
    return reply.send({ removed, state: parsed.data.state, olderThanHours: parsed.data.olderThanHours });
  });

  for (const verb of ['pause', 'resume'] as const) {
    app.post(`/api/internal/queues/:name/${verb}`, { preHandler: dangerous('platform.queues.replay') }, async (request, reply) => {
      const parsed = actionBody.safeParse(request.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
      const entry = findQueue(request, reply);
      if (!entry) return reply;
      if (verb === 'pause') await entry.backend.pause();
      else await entry.backend.resume();
      const paused = await entry.backend.isPaused();
      await record(request, {
        action: verb === 'pause' ? 'QUEUE_PAUSED' : 'QUEUE_RESUMED',
        type: verb === 'pause' ? 'queue.paused' : 'queue.resumed',
        queue: entry.name,
        summary: `${entry.name} queue ${verb === 'pause' ? 'paused' : 'resumed'}`,
        severity: verb === 'pause' ? 'ATTENTION' : 'INFO',
        metadata: { paused }
      });
      return reply.send({ name: entry.name, paused });
    });
  }
}
