import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { exceptionsService } from './exceptions.service.js';
import { resolveExceptionSchema, slaPolicyCreateSchema } from './exceptions.schema.js';
import { EscalationError, escalateBody, escalateException, presentTenantEscalation } from '../../services/exception-escalation.service.js';

// Exception cases are operations data: tenant staff roles only (customers of the tenant never see them).
const OPS_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'];

function tenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const id = request.tenant?.id;
  if (!id) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return id;
}

type ExceptionWithEscalation = NonNullable<Awaited<ReturnType<typeof exceptionsService.get>>>;

/** Tenant view: case fields plus the escalation summary; staff ids (assignee, reply authors) are never exposed. */
function present(row: ExceptionWithEscalation) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    shipmentId: row.shipmentId,
    shipment: row.shipment,
    type: row.type,
    severity: row.severity,
    status: row.status,
    assignedTo: row.assignedTo,
    aiDiagnosis: row.aiDiagnosis,
    notes: row.notes,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    escalation: presentTenantEscalation(row)
  };
}

export async function registerExceptionsRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate, requireTenantMatch, requireRole(OPS_ROLES)] };

  app.get('/api/v1/tenant/exceptions', guard, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    const rows = await exceptionsService.list(app.prisma, tid);
    reply.send({ data: rows.map(present) });
  });

  app.get('/api/v1/tenant/exceptions/:id', guard, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    const { id } = request.params as { id: string };
    const exception = await exceptionsService.get(app.prisma, tid, id);
    if (!exception) return reply.status(404).send({ error: 'Exception not found' });
    reply.send(present(exception));
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

  // L15 (WP-2.11): escalate to Fauward with a reason; staff see it in the console Escalations page.
  app.post('/api/v1/tenant/exceptions/:id/escalate', guard, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    const { id } = request.params as { id: string };
    const parsed = escalateBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: 'A reason of at least 10 characters is required.' });
    try {
      const user = request.user!;
      const userLabel = user.impersonator ? 'Fauward staff (via impersonation)' : user.email;
      await escalateException(app, { tenantId: tid, exceptionId: id, userId: user.sub, userLabel, reason: parsed.data.reason });
      const row = await exceptionsService.get(app.prisma, tid, id);
      if (!row) return reply.status(404).send({ error: 'Exception not found' });
      return reply.send(present(row));
    } catch (error) {
      if (error instanceof EscalationError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
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

  app.post('/api/v1/tenant/sla-policies', { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] }, async (request, reply) => {
    const tid = tenantId(request, reply);
    if (!tid) return;
    const payload = slaPolicyCreateSchema.parse(request.body ?? {});
    reply.status(201).send(await exceptionsService.createSlaPolicy(app.prisma, tid, payload));
  });
}
