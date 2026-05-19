import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';

function healthTier(score: number) {
  if (score < 45) return 'CRITICAL';
  if (score < 70) return 'AT_RISK';
  return 'HEALTHY';
}

function tenantTips(factors: unknown): string[] {
  if (Array.isArray(factors)) {
    return factors.filter((item): item is string => typeof item === 'string').slice(0, 3);
  }
  if (factors && typeof factors === 'object') {
    return Object.entries(factors as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'number' && value < 0)
      .map(([key]) => `Review ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}.`)
      .slice(0, 3);
  }
  return [];
}

export async function registerTenantHealthRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenants/me/health', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const latest = await app.prisma.tenantHealthScore.findFirst({
      where: { tenantId },
      orderBy: { computedAt: 'desc' }
    });
    const score = latest?.score ?? 100;
    const tier = healthTier(score);
    const tips = tenantTips(latest?.factors);

    reply.send({
      score,
      tier,
      tips: tips.length > 0 ? tips : ['Complete your onboarding checklist.', 'Keep billing and contact settings up to date.']
    });
  });
}
