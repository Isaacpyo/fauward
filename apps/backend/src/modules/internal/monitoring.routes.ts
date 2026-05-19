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
import { config } from '../../config/index.js';

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

function statusCounts(rows: Array<{ customDomainStatus: string; _count: { _all: number } }>) {
  const counts: Record<string, number> = { NONE: 0, PENDING_DNS: 0, VERIFYING: 0, ACTIVE: 0, FAILED: 0 };
  for (const row of rows) counts[row.customDomainStatus] = row._count._all;
  return counts;
}

async function fetchVercelProjectSnapshot() {
  if (!config.vercel.apiToken || !config.vercel.portalProjectId) {
    return {
      apiReachable: false,
      projectReachable: false,
      projectId: config.vercel.portalProjectId ?? null,
      projectName: null,
      expectedPortalDomain: config.vercel.expectedPortalDomain,
      expectedPortalDomainAttached: false,
      domainCount: null,
      unconfigured: true
    };
  }

  const teamQuery = config.vercel.teamId ? `?teamId=${encodeURIComponent(config.vercel.teamId)}` : '';
  const headers = { Authorization: `Bearer ${config.vercel.apiToken}` };
  const base = config.vercel.apiBase.replace(/\/$/, '');
  const projectId = config.vercel.portalProjectId;

  const projectResponse = await fetch(`${base}/v9/projects/${encodeURIComponent(projectId)}${teamQuery}`, {
    headers,
    signal: AbortSignal.timeout(8000)
  });
  if (!projectResponse.ok) {
    return {
      apiReachable: projectResponse.status < 500,
      projectReachable: false,
      status: projectResponse.status,
      projectId,
      projectName: null,
      expectedPortalDomain: config.vercel.expectedPortalDomain,
      expectedPortalDomainAttached: false,
      domainCount: null
    };
  }

  const project = await projectResponse.json() as { id?: string; name?: string };
  const domainsResponse = await fetch(`${base}/v9/projects/${encodeURIComponent(projectId)}/domains${teamQuery}`, {
    headers,
    signal: AbortSignal.timeout(8000)
  });
  const domainsBody = domainsResponse.ok
    ? await domainsResponse.json() as { domains?: Array<{ name?: string; verified?: boolean }> }
    : { domains: [] };
  const domains = domainsBody.domains ?? [];
  const expectedPortalDomainAttached = domains.some((domain) => domain.name === config.vercel.expectedPortalDomain);

  return {
    apiReachable: true,
    projectReachable: true,
    status: projectResponse.status,
    projectId: project.id ?? projectId,
    projectName: project.name ?? null,
    expectedPortalDomain: config.vercel.expectedPortalDomain,
    expectedPortalDomainAttached,
    domainCount: domains.length,
    activeProjectDomains: domains.filter((domain) => domain.verified).length
  };
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

  // Custom domain health: DB status counts plus Vercel project guardrails.
  app.get('/api/internal/metrics/custom-domains', async (req, reply) => {
    if (!checkMonitoringKey(req, reply)) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const [total, groupedStatuses, stalePending, recentRows, vercelResult] = await Promise.allSettled([
        app.prisma.tenant.count({ where: { customDomain: { not: null } } }),
        app.prisma.tenant.groupBy({
          by: ['customDomainStatus'],
          where: { customDomain: { not: null } },
          _count: { _all: true }
        }),
        app.prisma.tenant.count({
          where: {
            customDomain: { not: null },
            customDomainStatus: { in: ['PENDING_DNS', 'VERIFYING'] },
            customDomainLastCheckAt: { lt: new Date(Date.now() - 30 * 60 * 1000) }
          }
        }),
        app.prisma.tenant.findMany({
          where: { customDomain: { not: null } },
          select: {
            id: true,
            slug: true,
            name: true,
            customDomain: true,
            customDomainStatus: true,
            domainVerified: true,
            customDomainLastCheckAt: true,
            customDomainVerifiedAt: true,
            customDomainError: true
          },
          orderBy: [{ customDomainStatus: 'asc' }, { customDomainAddedAt: 'desc' }],
          take: 25
        }),
        fetchVercelProjectSnapshot()
      ]);

      const counts = groupedStatuses.status === 'fulfilled' ? statusCounts(groupedStatuses.value) : {};
      const issues: string[] = [];
      const vercel = vercelResult.status === 'fulfilled'
        ? vercelResult.value
        : {
            apiReachable: false,
            projectReachable: false,
            projectId: config.vercel.portalProjectId ?? null,
            projectName: null,
            expectedPortalDomain: config.vercel.expectedPortalDomain,
            expectedPortalDomainAttached: false,
            domainCount: null,
            unconfigured: true
          };

      if (!vercel.unconfigured && (!vercel.apiReachable || !vercel.projectReachable)) issues.push('Vercel API/project check failed');
      if (!vercel.unconfigured && vercel.expectedPortalDomain && !vercel.expectedPortalDomainAttached) {
        issues.push(`Expected portal domain ${vercel.expectedPortalDomain} is not attached to the configured Vercel project`);
      }
      if ((counts.FAILED ?? 0) > 0) issues.push(`${counts.FAILED} custom domain(s) are failed`);
      if (stalePending.status === 'fulfilled' && stalePending.value > 0) {
        issues.push(`${stalePending.value} pending custom domain(s) have not been checked in 30+ minutes`);
      }

      const vercelDown = !vercel.unconfigured && (!vercel.apiReachable || !vercel.projectReachable);
      const status = vercelDown
        ? 'down'
        : issues.length > 0
          ? 'degraded'
          : 'up';

      return reply.send({
        status,
        total: total.status === 'fulfilled' ? total.value : null,
        counts,
        stalePending: stalePending.status === 'fulfilled' ? stalePending.value : null,
        vercel,
        domains: recentRows.status === 'fulfilled' ? recentRows.value : [],
        issues,
        checkedAt: new Date().toISOString()
      });
    } catch (err) {
      app.log.error({ err }, 'Custom domain health query failed');
      return reply.status(503).send({ error: 'Custom domain health unavailable' });
    }
  });

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
