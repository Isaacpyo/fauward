import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { surchargeCreateSchema } from './pricing.schema.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerPricingSurchargeRoutes(app: FastifyInstance) {
  const guard = { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] };

  app.get('/surcharges', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const surcharges = await app.prisma.surcharge.findMany({
      where: { tenantId },
      orderBy: [{ condition: 'asc' }, { name: 'asc' }]
    });
    reply.send({ surcharges });
  });

  app.post('/surcharges', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const payload = surchargeCreateSchema.parse(request.body);
    const surcharge = await app.prisma.surcharge.create({
      data: {
        tenantId,
        name: payload.name,
        description: payload.description,
        type: payload.type,
        condition: payload.condition,
        value: payload.value,
        threshold: payload.threshold,
        peakFrom: payload.peakFrom ? new Date(payload.peakFrom) : null,
        peakTo: payload.peakTo ? new Date(payload.peakTo) : null,
        isEnabled: payload.isEnabled ?? true,
        isVisibleToCustomer: payload.isVisibleToCustomer ?? true
      }
    });
    reply.status(201).send(surcharge);
  });

  app.patch('/surcharges/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = surchargeCreateSchema.partial().parse(request.body);
    const existing = await app.prisma.surcharge.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Surcharge not found' });
    const updated = await app.prisma.surcharge.update({
      where: { id: existing.id },
      data: {
        name: payload.name,
        description: payload.description,
        type: payload.type,
        condition: payload.condition,
        value: payload.value,
        threshold: payload.threshold,
        peakFrom: payload.peakFrom ? new Date(payload.peakFrom) : undefined,
        peakTo: payload.peakTo ? new Date(payload.peakTo) : undefined,
        isEnabled: payload.isEnabled,
        isVisibleToCustomer: payload.isVisibleToCustomer
      }
    });
    reply.send(updated);
  });

  app.delete('/surcharges/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const existing = await app.prisma.surcharge.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Surcharge not found' });
    await app.prisma.surcharge.delete({ where: { id: existing.id } });
    reply.send({ success: true });
  });

  app.patch('/surcharges/:id/toggle', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const existing = await app.prisma.surcharge.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Surcharge not found' });

    const updated = await app.prisma.$transaction(async (tx) => {
      const record = await tx.surcharge.update({
        where: { id: existing.id },
        data: { isEnabled: !existing.isEnabled }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: request.user?.sub,
          action: 'SURCHARGE_TOGGLE',
          resourceType: 'SURCHARGE',
          resourceId: existing.id,
          metadata: { isEnabled: record.isEnabled }
        }
      });
      return record;
    });

    reply.send(updated);
  });
}

