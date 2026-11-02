import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import {
  HandoffError,
  getHandoff,
  handoffTemplate,
  listAssignees,
  listQueue,
  listWon,
  queueQuery,
  updateHandoff,
  updateHandoffBody,
  wonQuery
} from '../../../services/handoff.service.js';

// gtm.handoff (WP-4.17): the sales → CS queue (created on trial → paid), recent conversions, the code-defined template,
// CSM assignees, and one PATCH for notes, checklist, assignment and the status flow.

const read = [authenticatePlatformSession, requireConsolePermission('gtm.handoff.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('gtm.handoff.write')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof HandoffError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleHandoffRoutes(app: FastifyInstance) {
  app.get('/api/internal/handoff/queue', { preHandler: read }, async (request, reply) => {
    const parsed = queueQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listQueue(app, parsed.data));
  });

  app.get('/api/internal/handoff/won', { preHandler: read }, async (request, reply) => {
    const parsed = wonQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listWon(app, parsed.data));
  });

  app.get('/api/internal/handoff/templates', { preHandler: read }, async (_request, reply) => reply.send(handoffTemplate()));

  app.get('/api/internal/handoff/assignees', { preHandler: read }, async (_request, reply) => reply.send(await listAssignees(app)));

  app.get('/api/internal/handoff/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await getHandoff(app, id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch('/api/internal/handoff/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateHandoffBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await updateHandoff(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
