import type { FastifyReply, FastifyRequest } from 'fastify';
import { loadRequestEntitlements } from './entitlements.js';

/** 403 PLAN_REQUIRED unless the tenant's effective plan (override-aware, WP-1.4) is one of `allowedPlans`. */
export function requirePlan(allowedPlans: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const entitlements = await loadRequestEntitlements(req);
    const plan = entitlements?.effectivePlan ?? req.user?.plan ?? 'STARTER';
    if (!allowedPlans.includes(String(plan).toUpperCase())) {
      return reply.status(403).send({
        error: 'PLAN_REQUIRED',
        code: 'PLAN_REQUIRED',
        requiredPlans: allowedPlans
      });
    }
  };
}
