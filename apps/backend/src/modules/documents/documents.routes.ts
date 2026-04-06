import type { FastifyInstance } from 'fastify';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { documentsService } from './documents.service.js';

export async function registerDocumentsRoutes(app: FastifyInstance) {
  app.post('/api/v1/documents/delivery-note/:shipmentId', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const { shipmentId } = request.params as { shipmentId: string };
    try {
      const result = await documentsService.generateDeliveryNote(app, tenantId, shipmentId);
      reply.status(201).send(result);
    } catch (error) {
      reply.status(400).send({ error: error instanceof Error ? error.message : 'Unable to generate delivery note' });
    }
  });

  app.post('/api/v1/documents/invoice/:invoiceId', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const { invoiceId } = request.params as { invoiceId: string };
    try {
      const result = await documentsService.generateInvoicePdf(app, tenantId, invoiceId);
      reply.status(201).send(result);
    } catch (error) {
      reply.status(400).send({ error: error instanceof Error ? error.message : 'Unable to generate invoice document' });
    }
  });

  app.get('/api/v1/documents/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const { id } = request.params as { id: string };
    try {
      const result = await documentsService.getSignedUrl(app, tenantId, id);
      reply.send(result);
    } catch (error) {
      reply.status(404).send({ error: error instanceof Error ? error.message : 'Document not found' });
    }
  });
}
