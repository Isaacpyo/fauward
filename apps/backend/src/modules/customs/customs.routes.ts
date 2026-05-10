import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { customsDeclarationSchema, customsDeclarationUpdateSchema, hsLookupSchema } from './customs.schema.js';
import { customsService } from './customs.service.js';
import { hsLookupService } from './hs-lookup.service.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerCustomsRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate, requireTenantMatch] };

  app.post('/api/v1/tenant/shipments/:id/customs/declaration', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    try {
      const payload = customsDeclarationSchema.parse(request.body ?? {});
      const declaration = await customsService.createDeclaration(app, tenantId, id, payload);
      if (!declaration) return reply.status(404).send({ error: 'Shipment not found' });
      reply.status(201).send(declaration);
    } catch (error) {
      if (error instanceof ZodError) return reply.status(422).send({ error: 'VALIDATION_ERROR', issues: error.issues });
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 400;
      reply.status(statusCode).send({ error: error instanceof Error ? error.message : 'Unable to create declaration' });
    }
  });

  app.get('/api/v1/tenant/shipments/:id/customs/declaration', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const declaration = await customsService.getDeclaration(app.prisma, tenantId, id);
    if (!declaration) return reply.status(404).send({ error: 'Customs declaration not found' });
    reply.send(declaration);
  });

  app.put('/api/v1/tenant/shipments/:id/customs/declaration', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    try {
      const payload = customsDeclarationUpdateSchema.parse(request.body ?? {});
      const declaration = await customsService.updateDeclaration(app, tenantId, id, payload);
      if (!declaration) return reply.status(404).send({ error: 'Customs declaration not found' });
      reply.send(declaration);
    } catch (error) {
      if (error instanceof ZodError) return reply.status(422).send({ error: 'VALIDATION_ERROR', issues: error.issues });
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 400;
      reply.status(statusCode).send({ error: error instanceof Error ? error.message : 'Unable to update declaration' });
    }
  });

  app.post('/api/v1/tenant/customs/hs-lookup', guard, async (request, reply) => {
    const payload = hsLookupSchema.parse(request.body ?? {});
    const result = await hsLookupService.lookup(payload.description);
    reply.send(result);
  });

  app.get('/api/v1/tenant/customs/restricted-items', guard, async (request, reply) => {
    const query = request.query as { country?: string };
    if (!query.country) return reply.status(400).send({ error: 'country is required' });
    reply.send(customsService.restrictedItems(query.country));
  });
}
