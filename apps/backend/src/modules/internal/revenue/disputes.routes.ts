import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { DisputeError, addNote, disputeListQuery, evidenceBody, getDispute, listDisputes, noteBody, submitEvidence } from '../../../services/dispute.service.js';

// revenue.disputes (WP-4.6): queue by status and evidence due, detail with the matched payment and notes, evidence
// submit to Stripe (dangerous), internal notes. Producers are the Stripe charge.dispute.* webhooks (payments.routes.ts).

const read = [authenticatePlatformSession, requireConsolePermission('revenue.disputes.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('revenue.disputes.write')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof DisputeError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleDisputeRoutes(app: FastifyInstance) {
  app.get('/api/internal/disputes', { preHandler: read }, async (request, reply) => {
    const parsed = disputeListQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listDisputes(app, parsed.data));
  });

  app.get('/api/internal/disputes/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dispute = await getDispute(app, id);
    if (!dispute) return reply.status(404).send({ error: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    return reply.send(dispute);
  });

  app.post('/api/internal/disputes/:id/evidence', { preHandler: dangerous('revenue.disputes.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = evidenceBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await submitEvidence(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/disputes/:id/notes', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = noteBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await addNote(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
