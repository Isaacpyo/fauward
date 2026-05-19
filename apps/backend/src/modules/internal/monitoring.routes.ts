import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getRelayAdminClient } from '@fauward/relay-api';
import {
  notificationQueue,
  webhookQueue,
  outboxQueue,
  pdfQueue,
  analyticsQueue,
  scheduledJobsQueue,
  routeOptimizationQueue,
} from '../../queues/queues.js';

type Queue = typeof notificationQueue;

async function safeQueueStats(queue: Queue) {
  try {
    const [counts, workers, waitingJobs] = await Promise.all([
      queue.getJobCounts('active', 'wait', 'delayed', 'failed', 'paused'),
      queue.getWorkers(),
      queue.getWaiting(0, 0), // oldest waiting job
    ]);

    const oldestJob = waitingJobs[0];
    const oldestJobAgeSecs = oldestJob
      ? Math.floor((Date.now() - oldestJob.timestamp) / 1000)
      : null;

    return {
      active:          counts.active   ?? 0,
      depth:           counts.wait     ?? 0,
      delayed:         counts.delayed  ?? 0,
      failed:          counts.failed   ?? 0,
      paused:          counts.paused   ?? 0,
      workerCount:     workers.length,
      oldestJobAgeSecs,
    };
  } catch {
    return null;
  }
}

// Simple monitoring key guard — set MONITORING_API_KEY env var to protect in production
function checkMonitoringKey(req: FastifyRequest, _reply: FastifyReply) {
  const key = process.env.MONITORING_API_KEY;
  if (!key) return true; // no key configured — allow (lock down in prod via env)
  const auth = req.headers.authorization ?? '';
  return auth === `Bearer ${key}`;
}

export async function registerMonitoringRoutes(app: FastifyInstance) {
  app.get('/api/internal/metrics/queues', async (req, reply) => {
    if (!checkMonitoringKey(req, reply)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const [notification, webhook, outbox, pdf, analytics, scheduled, routeOpt] = await Promise.all([
      safeQueueStats(notificationQueue),
      safeQueueStats(webhookQueue),
      safeQueueStats(outboxQueue),
      safeQueueStats(pdfQueue),
      safeQueueStats(analyticsQueue),
      safeQueueStats(scheduledJobsQueue),
      safeQueueStats(routeOptimizationQueue),
    ]);

    return reply.send({
      queues: [
        { id: 'notification',       stats: notification },
        { id: 'webhook',            stats: webhook },
        { id: 'outbox',             stats: outbox },
        { id: 'pdf',                stats: pdf },
        { id: 'analytics',          stats: analytics },
        { id: 'scheduled-jobs',     stats: scheduled },
        { id: 'route-optimization', stats: routeOpt },
      ],
      checkedAt: new Date().toISOString(),
    });
  });

  app.get('/api/internal/metrics/business-health', async (req, reply) => {
    if (!checkMonitoringKey(req, reply)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const now        = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    try {
      const [activeTenants, suspendedTenants, trialingTenants, shipmentsToday, inTransit, stuck] =
        await Promise.all([
          app.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
          app.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
          app.prisma.tenant.count({ where: { status: 'TRIALING' } }),
          app.prisma.shipment.count({ where: { createdAt: { gte: startOfDay } } }),
          app.prisma.shipment.count({
            where: { status: { in: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'] } },
          }),
          app.prisma.shipment.count({ where: { status: 'EXCEPTION' } }).catch(() => 0),
        ]);

      return reply.send({
        activeTenants,
        suspendedTenants,
        trialingTenants,
        shipmentsCreatedToday: shipmentsToday,
        shipmentsInTransit:    inTransit,
        stuckShipments:        stuck,
        isMock:                false,
        checkedAt:             now.toISOString(),
      });
    } catch (err) {
      app.log.error({ err }, 'Business health query failed');
      return reply.status(503).send({ error: 'Database unavailable' });
    }
  });

  // ── Relay health ─────────────────────────────────────────────────────────
  // Checks Supabase relay_conversations for stuck AI sessions and pending
  // human-needed conversations — the two main relay failure modes.
  app.get('/api/internal/metrics/relay-health', async (req, reply) => {
    if (!checkMonitoringKey(req, reply)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const fiveMinAgo     = new Date(Date.now() - 5  * 60 * 1000).toISOString();
    const twentyFourHAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const supabase = getRelayAdminClient();

      const [openConvs, aiStuck, humanNeeded, recentMessages] = await Promise.all([
        supabase.from('relay_conversations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        // AI started handling but hasn't finished in 5+ min = stuck
        supabase.from('relay_conversations')
          .select('id', { count: 'exact', head: true })
          .eq('ai_status', 'ai_handling')
          .lt('updated_at', fiveMinAgo),
        // Waiting for a human to pick up
        supabase.from('relay_conversations')
          .select('id', { count: 'exact', head: true })
          .eq('ai_status', 'human_needed')
          .eq('status', 'open'),
        // Messages sent in last 24h — delivery activity indicator
        supabase.from('relay_messages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', twentyFourHAgo),
      ]);

      const supabaseReachable = !openConvs.error;

      return reply.send({
        openConversations: openConvs.count   ?? 0,
        aiStuck:           aiStuck.count     ?? 0,   // > 0 = AI assistant not firing
        humanNeeded:       humanNeeded.count ?? 0,   // conversations awaiting human reply
        messagesLast24h:   recentMessages.count ?? 0,
        supabaseReachable,
        checkedAt:         new Date().toISOString(),
      });
    } catch (err) {
      app.log.error({ err }, 'Relay health check failed');
      return reply.status(503).send({ error: 'Relay health unavailable' });
    }
  });
}
