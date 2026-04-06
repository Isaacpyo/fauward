import type { FastifyReply, FastifyRequest } from 'fastify';
import { planService } from '../../modules/tenants/plan.service.js';

export function requireFeature(feature: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const plan = req.tenant?.plan ?? 'STARTER';
    const hasIt = planService.hasFeature(plan, feature);
    if (!hasIt) {
      return reply.status(403).send({
        error: `${feature} requires Pro or Enterprise plan`,
        code: 'FEATURE_NOT_AVAILABLE',
        upgradeUrl: 'https://fauward.com/upgrade'
      });
    }
  };
}