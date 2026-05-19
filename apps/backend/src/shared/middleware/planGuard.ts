import type { FastifyReply, FastifyRequest } from 'fastify';

export function requirePlan(allowedPlans: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const plan = req.tenant?.plan ?? req.user?.plan ?? 'STARTER';
    if (!allowedPlans.includes(String(plan).toUpperCase())) {
      return reply.status(403).send({
        error: 'PLAN_REQUIRED',
        code: 'PLAN_REQUIRED',
        requiredPlans: allowedPlans
      });
    }
  };
}
