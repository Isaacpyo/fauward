import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { exceptionsService } from './exceptions.service.js';
import { resolveExceptionSchema, slaPolicyCreateSchema } from './exceptions.schema.js';

function tenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const id = request.tenant?.id;
  if (!id) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return id;
}

export async function registerExceptionsRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate, requireTenantMatch] };

  app.get('/api/v1/tenant/exceptions', guard, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    reply.send({ data: await exceptionsService.list(app.prisma, tid) });
  });

  app.get('/api/v1/tenant/exceptions/:id', guard, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    const { id } = request.params as { id: string };
    const exception = await exceptionsService.get(app.prisma, tid, id);
    if (!exception) return reply.status(404).send({ error: 'Exception not found' });
    reply.send(exception);
  });

  app.post('/api/v1/tenant/exceptions/:id/resolve', guard, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    const { id } = request.params as { id: string };
    const payload = resolveExceptionSchema.parse(request.body ?? {});
    const exception = await exceptionsService.resolve(app.prisma, tid, id, payload.notes);
    if (!exception) return reply.status(404).send({ error: 'Exception not found' });
    reply.send(exception);
  });

  app.get('/api/v1/tenant/exceptions/:id/ai-diagnosis', guard, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    const { id } = request.params as { id: string };
    const exception = await exceptionsService.get(app.prisma, tid, id);
    if (!exception) return reply.status(404).send({ error: 'Exception not found' });
    reply.send({ aiDiagnosis: exception.aiDiagnosis ?? null });
  });

  app.get('/api/v1/tenant/sla-policies', guard, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    reply.send({ data: await exceptionsService.listSlaPolicies(app.prisma, tid) });
  });

  app.post('/api/v1/tenant/sla-policies', guard, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    const payload = slaPolicyCreateSchema.parse(request.body ?? {});
    reply.status(201).send(await exceptionsService.createSlaPolicy(app.prisma, tid, payload));
  });
}
