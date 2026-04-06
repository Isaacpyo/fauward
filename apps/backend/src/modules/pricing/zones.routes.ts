import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { zoneCreateSchema } from './pricing.schema.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerPricingZoneRoutes(app: FastifyInstance) {
  app.get('/zones', { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const zones = await app.prisma.serviceZone.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { originRateCards: true, destRateCards: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    reply.send({
      zones: zones.map((zone) => ({
        ...zone,
        rateCardCount: zone._count.originRateCards + zone._count.destRateCards
      }))
    });
  });

  app.post('/zones', { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const payload = zoneCreateSchema.parse(request.body);

    const zone = await app.prisma.serviceZone.create({
      data: {
        tenantId,
        name: payload.name,
        zoneType: payload.zoneType,
        description: payload.description
      }
    });
    reply.status(201).send(zone);
  });

  app.patch('/zones/:id', { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = zoneCreateSchema.partial().parse(request.body);

    const zone = await app.prisma.serviceZone.findFirst({ where: { id, tenantId } });
    if (!zone) return reply.status(404).send({ error: 'Zone not found' });

    const updated = await app.prisma.serviceZone.update({
      where: { id: zone.id },
      data: payload
    });
    reply.send(updated);
  });

  app.delete('/zones/:id', { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };

    const zone = await app.prisma.serviceZone.findFirst({
      where: { id, tenantId },
      include: {
        _count: {
          select: { originRateCards: true, destRateCards: true }
        }
      }
    });
    if (!zone) return reply.status(404).send({ error: 'Zone not found' });
    if (zone._count.originRateCards + zone._count.destRateCards > 0) {
      return reply.status(400).send({ error: 'Cannot delete zone with active rate cards' });
    }

    await app.prisma.serviceZone.delete({ where: { id: zone.id } });
    reply.send({ success: true });
  });
}

