import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { shippingRuleCreateSchema, shippingRuleTestSchema, shippingRuleUpdateSchema } from './shipping-rules.schema.js';
import { shippingRulesService } from './shipping-rules.service.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerShippingRulesRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] };

  app.get('/api/v1/tenant/shipping-rules', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const rules = await shippingRulesService.list(app.prisma, tenantId);
    reply.send({ rules });
  });

  app.post('/api/v1/tenant/shipping-rules', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const payload = shippingRuleCreateSchema.parse(request.body ?? {});
    const rule = await shippingRulesService.create(app.prisma, tenantId, payload);
    await app.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: request.user?.sub,
        action: 'SHIPPING_RULE_CREATE',
        resourceType: 'SHIPPING_RULE',
        resourceId: rule.id
      }
    });
    reply.status(201).send(rule);
  });

  app.put('/api/v1/tenant/shipping-rules/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = shippingRuleUpdateSchema.parse(request.body ?? {});
    const rule = await shippingRulesService.update(app.prisma, tenantId, id, payload);
    if (!rule) return reply.status(404).send({ error: 'Shipping rule not found' });
    await app.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: request.user?.sub,
        action: 'SHIPPING_RULE_UPDATE',
        resourceType: 'SHIPPING_RULE',
        resourceId: id
      }
    });
    reply.send(rule);
  });

  app.delete('/api/v1/tenant/shipping-rules/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const removed = await shippingRulesService.remove(app.prisma, tenantId, id);
    if (!removed) return reply.status(404).send({ error: 'Shipping rule not found' });
    await app.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: request.user?.sub,
        action: 'SHIPPING_RULE_DELETE',
        resourceType: 'SHIPPING_RULE',
        resourceId: id
      }
    });
    reply.status(204).send();
  });

  app.post('/api/v1/tenant/shipping-rules/:id/test', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = shippingRuleTestSchema.parse(request.body ?? {});
    const result = await shippingRulesService.test(app.prisma, tenantId, id, payload.shipment);
    if (!result) return reply.status(404).send({ error: 'Shipping rule not found' });
    reply.send(result);
  });
}
