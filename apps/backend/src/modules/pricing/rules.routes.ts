import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { pricingRuleCreateSchema } from './pricing.schema.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerPricingRuleRoutes(app: FastifyInstance) {
  const guard = { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] };

  app.get('/rules', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const rules = await app.prisma.pricingRule.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
    });
    reply.send({ rules });
  });

  app.post('/rules', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const payload = pricingRuleCreateSchema.parse(request.body);
    const rule = await app.prisma.$transaction(async (tx) => {
      const created = await tx.pricingRule.create({
        data: {
          tenantId,
          name: payload.name,
          description: payload.description,
          isEnabled: payload.isEnabled ?? true,
          priority: payload.priority ?? 100,
          conditions: payload.conditions,
          action: payload.action,
          actionValue: payload.actionValue,
          stopAfter: payload.stopAfter ?? false
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: request.user?.sub,
          action: 'PRICING_RULE_CREATE',
          resourceType: 'PRICING_RULE',
          resourceId: created.id
        }
      });
      return created;
    });
    reply.status(201).send(rule);
  });

  app.patch('/rules/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = pricingRuleCreateSchema.partial().parse(request.body);
    const existing = await app.prisma.pricingRule.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Rule not found' });

    const updated = await app.prisma.$transaction(async (tx) => {
      const record = await tx.pricingRule.update({
        where: { id: existing.id },
        data: {
          name: payload.name,
          description: payload.description,
          isEnabled: payload.isEnabled,
          priority: payload.priority,
          conditions: payload.conditions,
          action: payload.action,
          actionValue: payload.actionValue,
          stopAfter: payload.stopAfter
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: request.user?.sub,
          action: 'PRICING_RULE_UPDATE',
          resourceType: 'PRICING_RULE',
          resourceId: existing.id
        }
      });
      return record;
    });
    reply.send(updated);
  });

  app.delete('/rules/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const existing = await app.prisma.pricingRule.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Rule not found' });

    await app.prisma.$transaction(async (tx) => {
      await tx.pricingRule.delete({ where: { id: existing.id } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: request.user?.sub,
          action: 'PRICING_RULE_DELETE',
          resourceType: 'PRICING_RULE',
          resourceId: existing.id
        }
      });
    });

    reply.send({ success: true });
  });

  app.patch('/rules/reorder', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { orderedIds } = request.body as { orderedIds?: string[] };
    if (!orderedIds || orderedIds.length === 0) {
      return reply.status(400).send({ error: 'orderedIds is required' });
    }

    await app.prisma.$transaction(
      orderedIds.map((id, index) =>
        app.prisma.pricingRule.updateMany({
          where: { id, tenantId },
          data: { priority: (index + 1) * 10 }
        })
      )
    );

    reply.send({ success: true });
  });

  app.patch('/rules/:id/toggle', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const existing = await app.prisma.pricingRule.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Rule not found' });
    const rule = await app.prisma.pricingRule.update({
      where: { id: existing.id },
      data: { isEnabled: !existing.isEnabled }
    });
    reply.send(rule);
  });
}

