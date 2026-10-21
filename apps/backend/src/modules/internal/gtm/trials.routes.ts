import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import {
  TrialError,
  decideExtension,
  decisionBody,
  extendBody,
  extendTrial,
  extensionListQuery,
  listExpiring,
  listExtensions,
  listTrials,
  trialDetail,
  trialListQuery
} from '../../../services/trials.service.js';

// gtm.trials (WP-4.14): trialing tenants with activation score and days left, the ≤ 7-day expiring list, extension
// requests (tenant banner) and their decision, and proactive extension. Decisions and extensions are dangerous.

const read = [authenticatePlatformSession, requireConsolePermission('gtm.trials.read')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof TrialError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleTrialRoutes(app: FastifyInstance) {
  app.get('/api/internal/trials', { preHandler: read }, async (request, reply) => {
    const parsed = trialListQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listTrials(app, parsed.data));
  });

  app.get('/api/internal/trials/expiring', { preHandler: read }, async (_request, reply) => reply.send(await listExpiring(app)));

  app.get('/api/internal/trials/extensions', { preHandler: read }, async (request, reply) => {
    const parsed = extensionListQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listExtensions(app, parsed.data));
  });

  app.post('/api/internal/trials/extensions/:id/decision', { preHandler: dangerous('gtm.trials.extend') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = decisionBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await decideExtension(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/trials/:tenantId', { preHandler: read }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    try {
      return reply.send(await trialDetail(app, tenantId));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/trials/:tenantId/extend', { preHandler: dangerous('gtm.trials.extend') }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const parsed = extendBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await extendTrial(app, request, tenantId, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
