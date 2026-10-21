import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import {
  RelayConsoleError,
  approveBody,
  approveDraft,
  convertBody,
  convertToTicket,
  getConversation,
  listConversations,
  listConversationsQuery,
  listFeedback,
  replyBody,
  replyToConversation,
  updateConversation,
  updateConversationBody
} from '../../../services/relay-console.service.js';

// L2 / L20 (WP-4.R, S13): the console's Relay page. Cookie session + console permissions; the backend calls Relay with
// its service client, so no tenant JWT or localStorage token is involved. A Relay outage is a 502, never a crash.

const read = [authenticatePlatformSession, requireConsolePermission('customer.support.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('customer.support.write')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof RelayConsoleError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  reply.log.error({ err: error }, 'Relay request failed');
  return reply.status(502).send({ error: 'RELAY_UNAVAILABLE', message: 'Relay could not be reached.', degraded: true });
}

export async function registerConsoleRelayRoutes(app: FastifyInstance) {
  app.get('/api/internal/relay/conversations', { preHandler: read }, async (request, reply) => {
    const parsed = listConversationsQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    try {
      return reply.send(await listConversations(app, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/relay/conversations/:id', { preHandler: read }, async (request, reply) => {
    try {
      return reply.send(await getConversation(app, (request.params as { id: string }).id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/relay/conversations/:id/messages', { preHandler: write }, async (request, reply) => {
    const parsed = replyBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await replyToConversation(app, request, (request.params as { id: string }).id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch('/api/internal/relay/conversations/:id', { preHandler: write }, async (request, reply) => {
    const parsed = updateConversationBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await updateConversation(app, request, (request.params as { id: string }).id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/relay/conversations/:id/convert-to-ticket', { preHandler: write }, async (request, reply) => {
    const parsed = convertBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await convertToTicket(app, request, (request.params as { id: string }).id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/relay/messages/:id/approve-and-send', { preHandler: write }, async (request, reply) => {
    const parsed = approveBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await approveDraft(app, request, (request.params as { id: string }).id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/relay/feedback', { preHandler: read }, async (_request, reply) => {
    try {
      return reply.send(await listFeedback());
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
