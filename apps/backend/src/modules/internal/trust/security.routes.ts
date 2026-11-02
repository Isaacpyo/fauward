import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { dangerous } from '../../../middleware/dangerous.js';
import {
  SecurityError,
  acknowledgeAnomaly,
  anomalyQuery,
  createIpBlock,
  ipBlockBody,
  ipRemoveBody,
  listAnomalies,
  listIpBlocks,
  listLogins,
  listSessions,
  loginQuery,
  removeIpBlock,
  resolveAnomaly,
  resolveBody,
  revokeBody,
  revokeSession,
  securityPageQuery
} from '../../../services/security.service.js';

// trust.security (WP-4.11): anomalies (acknowledge, resolve), staff logins, IP blocks (scope + expiry, create/remove
// dangerous), active console sessions (revoke dangerous). Enforcement of IP blocks lands in WP-5.4.

const read = [authenticatePlatformSession, requireConsolePermission('trust.security.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('trust.security.write')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof SecurityError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleSecurityRoutes(app: FastifyInstance) {
  app.get('/api/internal/security/anomalies', { preHandler: read }, async (request, reply) => {
    const parsed = anomalyQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listAnomalies(app, parsed.data));
  });

  app.post('/api/internal/security/anomalies/:id/acknowledge', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await acknowledgeAnomaly(app, request, id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/security/anomalies/:id/resolve', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = resolveBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await resolveAnomaly(app, request, id, parsed.data.note));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/security/logins', { preHandler: read }, async (request, reply) => {
    const parsed = loginQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listLogins(app, parsed.data));
  });

  app.get('/api/internal/security/ip-blocks', { preHandler: read }, async (request, reply) => {
    const parsed = securityPageQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listIpBlocks(app, parsed.data));
  });

  app.post('/api/internal/security/ip-blocks', { preHandler: dangerous('trust.security.write') }, async (request, reply) => {
    const parsed = ipBlockBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await createIpBlock(app, request, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete('/api/internal/security/ip-blocks/:id', { preHandler: dangerous('trust.security.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ipRemoveBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await removeIpBlock(app, request, id, parsed.data.reason));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/security/sessions', { preHandler: read }, async (request, reply) => {
    const parsed = securityPageQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listSessions(app, parsed.data, request.platform?.session.id ?? null));
  });

  app.post('/api/internal/security/sessions/:id/revoke', { preHandler: dangerous('trust.security.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = revokeBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await revokeSession(app, request, id, parsed.data.reason));
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
