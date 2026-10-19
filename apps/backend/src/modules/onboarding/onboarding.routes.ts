import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { staffActor } from '../../services/platform-activity.service.js';
import { ONBOARDING_STEPS, NudgeError, nudgeTenant, onboardingChecklist, onboardingFunnel, stuckTenants } from '../../services/onboarding.service.js';

// customer.onboarding (L7, WP-2.17). The tenant reads its checklist; steps are stamped only by the events that prove
// them (there is no "mark step done" endpoint any more). The console sees the funnel and stuck tenants and can nudge.

const funnelQuery = z.object({ cohort: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'cohort must be YYYY-MM').optional() });
const stuckQuery = z.object({ stuckAt: z.enum(ONBOARDING_STEPS).optional(), stuckDays: z.coerce.number().int().min(1).max(365).default(7) });

function tenantIdFrom(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerOnboardingRoutes(app: FastifyInstance) {
  async function getChecklist(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = tenantIdFrom(request, reply);
    if (!tenantId) return;
    const checklist = await onboardingChecklist(app.prisma, tenantId);
    if (!checklist) return reply.status(404).send({ error: 'Tenant not found' });
    return reply.send(checklist);
  }

  app.get('/api/v1/onboarding/checklist', { preHandler: [authenticate] }, getChecklist);
  app.get('/api/v1/tenants/me/onboarding', { preHandler: [authenticate] }, getChecklist);

  app.get('/api/internal/onboarding/funnel', { preHandler: [authenticatePlatformSession, requireConsolePermission('customer.onboarding.read')] }, async (request, reply) => {
    const parsed = funnelQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    return reply.send(await onboardingFunnel(app, parsed.data.cohort));
  });

  app.get('/api/internal/onboarding/tenants', { preHandler: [authenticatePlatformSession, requireConsolePermission('customer.onboarding.read')] }, async (request, reply) => {
    const parsed = stuckQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    return reply.send({ data: await stuckTenants(app, parsed.data) });
  });

  app.post(
    '/api/internal/onboarding/tenants/:id/nudge',
    { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('customer.success.write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = staffActor(request);
      try {
        return reply.send(await nudgeTenant(app, id, { actorType: 'STAFF', actorId: actor.actorId ?? null, actorLabel: actor.actorLabel }));
      } catch (error) {
        if (error instanceof NudgeError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
        throw error;
      }
    }
  );
}
