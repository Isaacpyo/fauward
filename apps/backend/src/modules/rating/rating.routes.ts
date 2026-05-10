import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { carrierAccountCreateSchema, carrierAccountUpdateSchema, quoteSelectionSchema, rateQuoteRequestSchema } from './rating.schema.js';
import { ratingService } from './rating.service.js';
import { carrierAccountService } from './carrier-account.service.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerRatingRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate, requireTenantMatch] };
  const managerGuard = { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] };

  app.post('/api/v1/tenant/rates/quote', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const payload = rateQuoteRequestSchema.parse(request.body);
    if (payload.shipmentId) {
      const shipment = await app.prisma.shipment.findFirst({ where: { id: payload.shipmentId, tenantId }, select: { id: true } });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });
    }

    const result = await ratingService.quote(app.prisma, { tenantId, ...payload, isSandbox: request.apiKey?.isSandbox ?? false });
    reply.status(201).send(result);
  });

  app.get('/api/v1/tenant/rates/quotes/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const quote = await ratingService.getQuoteForTenant(app.prisma, tenantId, id);
    if (!quote) return reply.status(404).send({ error: 'Rate quote not found' });
    if (request.apiKey && quote.isSandbox !== request.apiKey.isSandbox) return reply.status(404).send({ error: 'Rate quote not found' });
    try {
      ratingService.enforceNotExpired(quote);
    } catch (error) {
      return reply.status(410).send({ error: error instanceof Error ? error.message : 'Rate quote has expired' });
    }
    reply.send(quote);
  });

  app.post('/api/v1/tenant/rates/quotes/:id/select', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = quoteSelectionSchema.parse(request.body);

    const quote = await ratingService.getQuoteForTenant(app.prisma, tenantId, id);
    if (!quote) return reply.status(404).send({ error: 'Rate quote not found' });
    if (request.apiKey && quote.isSandbox !== request.apiKey.isSandbox) return reply.status(404).send({ error: 'Rate quote not found' });
    try {
      ratingService.enforceNotExpired(quote);
    } catch (error) {
      return reply.status(410).send({ error: error instanceof Error ? error.message : 'Rate quote has expired' });
    }

    const updated = await app.prisma.rateQuote.update({
      where: { id: quote.id },
      data: {
        selectedCarrier: payload.selectedCarrier,
        selectedServiceLevel: payload.selectedServiceLevel
      }
    });
    reply.send(updated);
  });

  app.get('/api/v1/tenant/rates/carriers', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const carriers = await carrierAccountService.list(app.prisma, tenantId);
    reply.send({ carriers });
  });

  app.get('/api/v1/tenant/rates/service-levels', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const serviceLevels = await app.prisma.carrierServiceLevel.findMany({
      where: { tenantId, isActive: true, carrierAccount: { isActive: true } },
      include: { carrierAccount: { select: { id: true, carrier: true, name: true } } },
      orderBy: [{ transitDays: 'asc' }, { name: 'asc' }]
    });
    reply.send({ serviceLevels });
  });

  app.post('/api/v1/tenant/carrier-accounts', managerGuard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const payload = carrierAccountCreateSchema.parse(request.body);
    const account = await carrierAccountService.create(app.prisma, tenantId, payload);
    reply.status(201).send(account);
  });

  app.patch('/api/v1/tenant/carrier-accounts/:id', managerGuard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = carrierAccountUpdateSchema.parse(request.body);
    const account = await carrierAccountService.update(app.prisma, tenantId, id, payload);
    if (!account) return reply.status(404).send({ error: 'Carrier account not found' });
    reply.send(account);
  });

  app.delete('/api/v1/tenant/carrier-accounts/:id', managerGuard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const removed = await carrierAccountService.remove(app.prisma, tenantId, id);
    if (!removed) return reply.status(404).send({ error: 'Carrier account not found' });
    reply.status(204).send();
  });
}
