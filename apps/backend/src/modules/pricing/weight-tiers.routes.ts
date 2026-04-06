import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { weightTierCreateSchema } from './pricing.schema.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerPricingWeightTierRoutes(app: FastifyInstance) {
  const guard = { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] };

  app.get('/weight-tiers', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const tiers = await app.prisma.weightDiscountTier.findMany({
      where: { tenantId },
      orderBy: { minWeightKg: 'asc' }
    });
    reply.send({ tiers });
  });

  app.post('/weight-tiers', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const payload = weightTierCreateSchema.parse(request.body);
    const tier = await app.prisma.weightDiscountTier.create({
      data: {
        tenantId,
        name: payload.name,
        minWeightKg: payload.minWeightKg,
        maxWeightKg: payload.maxWeightKg,
        discountType: payload.discountType,
        discountValue: payload.discountValue,
        isEnabled: payload.isEnabled ?? true
      }
    });
    reply.status(201).send(tier);
  });

  app.patch('/weight-tiers/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = weightTierCreateSchema.partial().parse(request.body);
    const existing = await app.prisma.weightDiscountTier.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Weight tier not found' });
    const updated = await app.prisma.weightDiscountTier.update({
      where: { id: existing.id },
      data: payload
    });
    reply.send(updated);
  });

  app.delete('/weight-tiers/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const existing = await app.prisma.weightDiscountTier.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Weight tier not found' });
    await app.prisma.weightDiscountTier.delete({ where: { id: existing.id } });
    reply.send({ success: true });
  });
}

