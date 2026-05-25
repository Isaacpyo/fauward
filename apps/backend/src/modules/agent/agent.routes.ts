import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

import { agentConfig } from './agent.config.js';
import { AgentEventSchema, AgentQuerySchema, AgentActionListQuerySchema } from './agent.schemas.js';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { runAgent, approveAgentAction } from './agent.service.js';
import { persistAgentRun } from './agent.audit.js';
import { buildToolHandlers } from './agent.handlers.impl.js';
import type { AgentEvent } from './agent.types.js';

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
    '/v1/agent/actions',
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
        ...(status ? { status } : {})
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

  app.post(
    '/v1/agent/actions/:id/approve',
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
    '/v1/agent/actions/:id/reject',
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
}

function getBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
