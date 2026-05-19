import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireInternalPermission } from '../../middleware/require-internal-permission.js';

const ONBOARDING_STEPS = ['BRANDING', 'TEAM', 'PAYMENT', 'FIRST_SHIPMENT', 'GO_LIVE'] as const;

function tenantIdFrom(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function normalizeSteps(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(ONBOARDING_STEPS.map((step) => [step, record[step] === true]));
}

export async function registerOnboardingRoutes(app: FastifyInstance) {
  async function getTenantOnboarding(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = tenantIdFrom(request, reply);
    if (!tenantId) return;
    const tenant = await app.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingSteps: true, onboardingCompletedAt: true, createdAt: true }
    });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    reply.send({
      steps: normalizeSteps(tenant.onboardingSteps),
      completedAt: tenant.onboardingCompletedAt,
      signedUpAt: tenant.createdAt
    });
  }

  app.get('/api/v1/tenants/me/onboarding', { preHandler: [authenticate] }, getTenantOnboarding);
  app.get('/api/v1/tenant/onboarding/steps', { preHandler: [authenticate] }, getTenantOnboarding);

  app.post('/api/v1/tenants/me/onboarding/steps', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = tenantIdFrom(request, reply);
    if (!tenantId) return;
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? (request.body as Record<string, unknown>)
      : {};
    const step = typeof body.step === 'string' ? body.step.trim().toUpperCase() : '';
    if (!ONBOARDING_STEPS.includes(step as (typeof ONBOARDING_STEPS)[number])) {
      return reply.status(400).send({ error: 'Invalid onboarding step' });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingSteps: true, onboardingCompletedAt: true }
    });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const steps = { ...normalizeSteps(tenant.onboardingSteps), [step]: true };
    const completed = ONBOARDING_STEPS.every((name) => steps[name]);
    const updated = await app.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        onboardingSteps: steps,
        onboardingCompletedAt: completed && !tenant.onboardingCompletedAt ? new Date() : tenant.onboardingCompletedAt
      },
      select: { onboardingSteps: true, onboardingCompletedAt: true }
    });

    reply.send({ steps: normalizeSteps(updated.onboardingSteps), completedAt: updated.onboardingCompletedAt });
  });

  app.get(
    '/api/internal/onboarding/funnel',
    { preHandler: [authenticatePlatformSession, requireInternalPermission('customer.onboarding.read')] },
    async (_request, reply) => {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const tenants = await app.prisma.tenant.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          onboardingSteps: true,
          onboardingCompletedAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 250
      });
      const rows = tenants.map((tenant) => ({
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        signedUpAt: tenant.createdAt,
        steps: normalizeSteps(tenant.onboardingSteps),
        completedAt: tenant.onboardingCompletedAt,
        daysActive: Math.max(0, Math.floor((Date.now() - tenant.createdAt.getTime()) / (24 * 60 * 60 * 1000)))
      }));
      const completedCount = rows.filter((row) => row.completedAt).length;
      reply.send({
        data: rows,
        metrics: {
          total: rows.length,
          completed: completedCount,
          conversionRate: rows.length ? completedCount / rows.length : 0
        }
      });
    }
  );
}
