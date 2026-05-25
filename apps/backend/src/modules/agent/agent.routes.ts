import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { agentConfig } from './agent.config.js';
import { AgentEventSchema, AgentQuerySchema, AgentActionListQuerySchema } from './agent.schemas.js';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { runAgent, approveAgentAction } from './agent.service.js';
import { persistAgentRun } from './agent.audit.js';
import { buildToolHandlers } from './agent.handlers.impl.js';
import { enqueueAgentSweep } from './agent.queue.js';
import type { AgentEvent } from './agent.types.js';

const SWEEP_FEATURE_KEY = 'agent_sweep';

function monthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function enforceSweepLimits(app: FastifyInstance, tenantId: string): Promise<void> {
  const limit = await app.prisma.tenantAiLimit.findUnique({ where: { tenantId } });
  if (!limit) return;
  if (
    Array.isArray(limit.featuresEnabled) &&
    limit.featuresEnabled.length > 0 &&
    !limit.featuresEnabled.includes(SWEEP_FEATURE_KEY)
  ) {
    throw app.httpErrors.forbidden('AI feature disabled for this plan');
  }
  if (limit.monthlyBudgetUsd !== null && limit.monthlyBudgetUsd !== undefined) {
    const usage = await app.prisma.tenantAiUsage.findMany({
      where: { tenantId, month: monthKey() },
      select: { costUsd: true }
    });
    const totalCost = usage.reduce((sum, row) => sum + Number(row.costUsd ?? 0), 0);
    if (totalCost >= Number(limit.monthlyBudgetUsd)) {
      throw app.httpErrors.paymentRequired('Monthly AI budget exhausted');
    }
  }
}

function sweepRateLimitKey(req: FastifyRequest): string {
  const tenantId = req.tenant?.id;
  return `agent-sweep:${tenantId ?? req.ip}`;
}

export async function registerAgentRoutes(app: FastifyInstance) {
  app.post('/v1/agent/handle-event', async (request, reply) => {
    if (!agentConfig.serviceToken) {
      app.log.error('AGENT_SERVICE_TOKEN is required for agent event handling');
      return reply.status(503).send({ error: 'Agent service auth is not configured' });
    }

    if (getBearerToken(request.headers.authorization) !== agentConfig.serviceToken) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Explicit eventId check before full schema validation for a clear error message
    const body = request.body as Record<string, unknown>;
    if (!body?.eventId) {
      return reply.status(400).send({ error: 'eventId is required' });
    }

    const parsed = AgentEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid agent event', details: parsed.error.flatten() });
    }

    const event: AgentEvent = parsed.data;

    try {
      const handlers = buildToolHandlers(app);
      const result = await runAgent(event, handlers, app.prisma);
      await persistAgentRun(event, result);

      return reply.send(result);
    } catch (err) {
      app.log.error({ err, eventId: event.eventId }, 'agent run failed unexpectedly');
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'agent failure' });
    }
  });

  app.post(
    '/v1/agent/query',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request, reply) => {
      // tenantId is derived exclusively from auth context — never trusted from request body
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const bodyParsed = AgentQuerySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({ error: 'Invalid query', details: bodyParsed.error.flatten() });
      }

      const event: AgentEvent = {
        eventId: randomUUID(), // queries are not idempotent — each invocation is unique
        type: 'nl_query',
        tenantId,
        payload: bodyParsed.data
      };

      try {
        const handlers = buildToolHandlers(app);
        const result = await runAgent(event, handlers, app.prisma);
        await persistAgentRun(event, result);

        return reply.send(result);
      } catch (err) {
        app.log.error({ err, tenantId }, 'agent query failed unexpectedly');
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'agent failure' });
      }
    }
  );

  // ─── Agent Action Approval Endpoints ───────────────────────────────────────

  app.get(
    '/api/v1/agent/actions',
    { preHandler: [app.authenticate, requireTenantMatch, requireFeature('agent')] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const queryParsed = AgentActionListQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.status(400).send({ error: 'Invalid query', details: queryParsed.error.flatten() });
      }

      const { status, page, limit } = queryParsed.data;
      const skip = (page - 1) * limit;

      const where = {
        tenantId,
        ...(status && status.length > 0 ? { status: { in: status } } : {})
      };

      const [items, total] = await Promise.all([
        app.prisma.agentAction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        app.prisma.agentAction.count({ where })
      ]);

      return reply.send({
        items,
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      });
    }
  );

  app.get(
    '/api/v1/agent/actions/summary',
    { preHandler: [app.authenticate, requireTenantMatch, requireFeature('agent')] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Status → tab mapping (kept in sync with TAB_FILTER on the frontend):
      //   needsYou = PENDING_APPROVAL  → "Needs you" tab
      //   flagged  = AUTO_APPLIED      → "Flagged" tab (flag_finding rows + auto-approved tool calls)
      //   doneToday = APPLIED (today)  → "Done" tab (human-approved + executed)
      //   failed   = FAILED            → surfaced in the strip + reachable via the All tab
      const [needsYou, flagged, doneToday, failed] = await Promise.all([
        app.prisma.agentAction.count({ where: { tenantId, status: 'PENDING_APPROVAL' } }),
        app.prisma.agentAction.count({ where: { tenantId, status: 'AUTO_APPLIED' } }),
        app.prisma.agentAction.count({
          where: { tenantId, status: 'APPLIED', appliedAt: { gte: startOfToday } }
        }),
        app.prisma.agentAction.count({ where: { tenantId, status: 'FAILED' } })
      ]);

      return reply.send({ needsYou, flagged, doneToday, failed });
    }
  );

  app.post(
    '/api/v1/agent/actions/:id/approve',
    { preHandler: [app.authenticate, requireTenantMatch, requireFeature('agent')] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const { id } = request.params as { id: string };
      const userId = (request.user as { sub: string }).sub;

      const handlers = buildToolHandlers(app);
      const result = await approveAgentAction(id, tenantId, userId, handlers, app.prisma);

      if (!result.success) {
        const statusCode = result.error === 'Action not found' ? 404 : 409;
        return reply.status(statusCode).send({ error: result.error });
      }

      return reply.send({ success: true, result: result.result });
    }
  );

  app.post(
    '/api/v1/agent/actions/:id/reject',
    { preHandler: [app.authenticate, requireTenantMatch, requireFeature('agent')] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const { id } = request.params as { id: string };
      const userId = (request.user as { sub: string }).sub;

      const action = await app.prisma.agentAction.findFirst({
        where: { id, tenantId }
      });

      if (!action) {
        return reply.status(404).send({ error: 'Action not found' });
      }

      if (action.status !== 'PENDING_APPROVAL') {
        return reply.status(409).send({ error: `Action is already ${action.status}` });
      }

      await app.prisma.agentAction.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedBy: userId
        }
      });

      return reply.send({ success: true });
    }
  );

  // ─── Run Agent Sweep ────────────────────────────────────────────────────────

  // `@fastify/rate-limit` is registered in production app.ts. Guard the preHandler so test
  // harnesses that skip the plugin can still mount these routes.
  const sweepPreHandlers: unknown[] = [app.authenticate, requireTenantMatch, requireFeature('agent')];
  if (typeof (app as unknown as { rateLimit?: unknown }).rateLimit === 'function') {
    sweepPreHandlers.push(
      (app as unknown as { rateLimit: (opts: unknown) => unknown }).rateLimit({
        max: 1,
        timeWindow: '5 minutes',
        keyGenerator: sweepRateLimitKey
      })
    );
  }

  app.post(
    '/api/v1/agent/run',
    { preHandler: sweepPreHandlers as never },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      // Refuse fast if the tenant is out of AI budget — avoids queueing a sweep that
      // each inner LLM call would reject anyway.
      await enforceSweepLimits(app, tenantId);

      const run = await app.prisma.aiAgentRun.create({
        data: {
          tenantId,
          agentType: 'sweep',
          input: {},
          status: 'RUNNING',
          stage: 'queued'
        }
      });

      await enqueueAgentSweep(app, { runId: run.id, tenantId });

      return reply.code(202).send({ runId: run.id });
    }
  );

  app.get(
    '/api/v1/agent/run/:id',
    { preHandler: [app.authenticate, requireTenantMatch, requireFeature('agent')] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const { id } = request.params as { id: string };
      const run = await app.prisma.aiAgentRun.findFirst({
        where: { id, tenantId }
      });
      if (!run) throw app.httpErrors.notFound('Run not found');

      return reply.send({
        id: run.id,
        status: run.status,
        stage: run.stage,
        scannedCount: run.scannedCount,
        flaggedCount: run.flaggedCount,
        proposedCount: run.proposedCount,
        finishedAt: run.finishedAt,
        output: run.output
      });
    }
  );

  // ─── Usage ──────────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/agent/usage',
    { preHandler: [app.authenticate, requireTenantMatch, requireFeature('agent')] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const month = monthKey();
      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);

      const [limit, usageRows, totalThisMonth, autoApplied, applied, byType] = await Promise.all([
        app.prisma.tenantAiLimit.findUnique({ where: { tenantId } }),
        app.prisma.tenantAiUsage.findMany({ where: { tenantId, month } }),
        app.prisma.agentAction.count({ where: { tenantId, createdAt: { gte: startOfMonth } } }),
        app.prisma.agentAction.count({
          where: { tenantId, status: 'AUTO_APPLIED', createdAt: { gte: startOfMonth } }
        }),
        app.prisma.agentAction.count({
          where: { tenantId, status: 'APPLIED', createdAt: { gte: startOfMonth } }
        }),
        app.prisma.agentAction.groupBy({
          by: ['type'],
          where: { tenantId, createdAt: { gte: startOfMonth } },
          _count: { _all: true }
        })
      ]);

      const totalCost = usageRows.reduce((sum, row) => sum + Number(row.costUsd ?? 0), 0);
      const totalRequests = usageRows.reduce((sum, row) => sum + Number(row.requestCount ?? 0), 0);
      const totalTokens = usageRows.reduce((sum, row) => sum + Number(row.tokenCount ?? 0), 0);

      return reply.send({
        month,
        actions: {
          total: totalThisMonth,
          autoApplied,
          approved: applied,
          autoHandledPct: totalThisMonth > 0 ? Math.round((autoApplied / totalThisMonth) * 100) : null,
          byType: byType.map((row) => ({ type: row.type, count: row._count._all }))
        },
        ai: {
          totalRequests,
          totalTokens,
          totalCostUsd: Number(totalCost.toFixed(6))
        },
        limit: limit
          ? {
              monthlyBudgetUsd: limit.monthlyBudgetUsd,
              flashRequestLimit: limit.flashRequestLimit,
              proRequestLimit: limit.proRequestLimit,
              featuresEnabled: limit.featuresEnabled ?? []
            }
          : null
      });
    }
  );
}

function getBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
