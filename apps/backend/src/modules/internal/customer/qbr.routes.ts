import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { QbrError, deckHtml, deckPatchBody, generateBody, getDeck, patchDeck, qbrOverview, requestGeneration, shareDeck, tenantDecks } from '../../../services/qbr.service.js';

// customer.qbr (WP-4.9): decks and tenants due a QBR, per-tenant decks, generate (queued job, one deck per quarter),
// deck detail, notes / READY, share with the tenant's admins, HTML download (the backend has no PDF tooling).

const read = [authenticatePlatformSession, requireConsolePermission('customer.qbr.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('customer.qbr.write')];

function invalid(reply: FastifyReply, error: ZodError) {
  return reply.status(400).send({ error: 'INVALID_BODY', message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof QbrError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleQbrRoutes(app: FastifyInstance) {
  app.get('/api/internal/qbr', { preHandler: read }, async (_request, reply) => reply.send(await qbrOverview(app)));

  app.get('/api/internal/qbr/tenants/:tenantId', { preHandler: read }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const result = await tenantDecks(app, tenantId);
    if (!result) return reply.status(404).send({ error: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
    return reply.send(result);
  });

  app.post('/api/internal/qbr/tenants/:tenantId/generate', { preHandler: write }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const parsed = generateBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      const result = await requestGeneration(app, request, tenantId, parsed.data);
      return reply.status(202).send({ deckId: result.deck.id, status: result.deck.status, period: result.deck.periodKey, queued: result.queued });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/qbr/decks/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deck = await getDeck(app, id);
    if (!deck) return reply.status(404).send({ error: 'DECK_NOT_FOUND', message: 'Deck not found' });
    return reply.send(deck);
  });

  app.patch('/api/internal/qbr/decks/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = deckPatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await patchDeck(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/qbr/decks/:id/share', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await shareDeck(app, request, id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/qbr/decks/:id/download', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deck = await deckHtml(app, id);
    if (!deck?.html) return reply.status(404).send({ error: 'DECK_NOT_GENERATED', message: 'The deck has no generated content yet' });
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-disposition', `attachment; filename="qbr-${deck.periodKey ?? id}.html"`)
      .header('cache-control', 'no-store')
      .send(deck.html);
  });
}
