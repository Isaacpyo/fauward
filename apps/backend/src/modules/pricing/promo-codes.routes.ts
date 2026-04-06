import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { promoCodeCreateSchema } from './pricing.schema.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerPricingPromoCodeRoutes(app: FastifyInstance) {
  const guard = { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] };

  app.get('/promo-codes', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const promoCodes = await app.prisma.promoCode.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
    reply.send({ promoCodes });
  });

  app.post('/promo-codes', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const payload = promoCodeCreateSchema.parse(request.body);
    const promoCode = await app.prisma.promoCode.create({
      data: {
        tenantId,
        code: payload.code.toUpperCase(),
        description: payload.description,
        type: payload.type,
        value: payload.value,
        minOrderValue: payload.minOrderValue,
        maxDiscountValue: payload.maxDiscountValue,
        maxUses: payload.maxUses,
        customerIds: payload.customerIds ?? [],
        isEnabled: payload.isEnabled ?? true,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null
      }
    });
    reply.status(201).send(promoCode);
  });

  app.patch('/promo-codes/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = promoCodeCreateSchema.partial().parse(request.body);
    const existing = await app.prisma.promoCode.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Promo code not found' });
    if (payload.maxUses !== undefined && payload.maxUses < existing.usedCount) {
      return reply.status(400).send({ error: 'maxUses cannot be lower than usedCount' });
    }

    const updated = await app.prisma.promoCode.update({
      where: { id: existing.id },
      data: {
        code: payload.code?.toUpperCase(),
        description: payload.description,
        type: payload.type,
        value: payload.value,
        minOrderValue: payload.minOrderValue,
        maxDiscountValue: payload.maxDiscountValue,
        maxUses: payload.maxUses,
        customerIds: payload.customerIds,
        isEnabled: payload.isEnabled,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined
      }
    });
    reply.send(updated);
  });

  app.delete('/promo-codes/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const existing = await app.prisma.promoCode.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Promo code not found' });
    if (existing.usedCount > 0) return reply.status(400).send({ error: 'Cannot delete promo code with usage' });
    await app.prisma.promoCode.delete({ where: { id: existing.id } });
    reply.send({ success: true });
  });

  app.post('/promo-codes/validate', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { code, subtotal, customerId } = request.body as {
      code?: string;
      subtotal?: number;
      customerId?: string;
    };
    if (!code || subtotal === undefined) {
      return reply.status(400).send({ error: 'code and subtotal are required' });
    }

    const promo = await app.prisma.promoCode.findFirst({
      where: { tenantId, code: code.toUpperCase(), isEnabled: true }
    });

    if (!promo) return reply.send({ valid: false, message: 'Promo code not found' });
    if (promo.expiresAt && promo.expiresAt < new Date()) return reply.send({ valid: false, message: 'Promo code expired' });
    if (promo.maxUses !== null && promo.maxUses !== undefined && promo.usedCount >= promo.maxUses) {
      return reply.send({ valid: false, message: 'Promo code usage limit reached' });
    }
    if (promo.customerIds.length > 0 && customerId && !promo.customerIds.includes(customerId)) {
      return reply.send({ valid: false, message: 'Promo code not available for this customer' });
    }
    if (promo.minOrderValue && Number(subtotal) < Number(promo.minOrderValue)) {
      return reply.send({ valid: false, message: `Minimum order value is ${promo.minOrderValue}` });
    }

    let discountAmount = 0;
    if (promo.type === 'PERCENT_OFF') {
      discountAmount = Number(subtotal) * (Number(promo.value) / 100);
      if (promo.maxDiscountValue) discountAmount = Math.min(discountAmount, Number(promo.maxDiscountValue));
    } else if (promo.type === 'FIXED_OFF') {
      discountAmount = Number(promo.value);
    }

    reply.send({
      valid: true,
      discountAmount: Math.max(0, discountAmount),
      discountType: promo.type,
      message: 'Promo applied'
    });
  });
}

