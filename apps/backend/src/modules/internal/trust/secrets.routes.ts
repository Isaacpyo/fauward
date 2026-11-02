import type { FastifyInstance, FastifyReply } from 'fastify';
import { z, type ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { dangerous } from '../../../middleware/dangerous.js';
import {
  SecretError,
  getSecret,
  listExpiringSecrets,
  listSecrets,
  markRotatedBody,
  markSecretRotated,
  patchSecret,
  secretAudit,
  secretPatchBody
} from '../../../services/secret-inventory.service.js';

// trust.secrets (WP-4.12): inventory from config/secret-registry.ts as observed by the trust.secret-inventory job
// (configured, fingerprint, rotation), owner/policy edits, manual "mark rotated" (dangerous) and the per-secret audit.
// No response ever contains a secret value.

const read = [authenticatePlatformSession, requireConsolePermission('trust.secrets.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('trust.secrets.write')];
const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().min(1).optional() });

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendSecretError(reply: FastifyReply, error: unknown) {
  if (error instanceof SecretError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleSecretRoutes(app: FastifyInstance) {
  app.get('/api/internal/secrets', { preHandler: read }, async (_request, reply) => reply.send(await listSecrets(app)));

  app.get('/api/internal/secrets/expiring', { preHandler: read }, async (_request, reply) => reply.send(await listExpiringSecrets(app)));

  app.get('/api/internal/secrets/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const secret = await getSecret(app, id);
    if (!secret) return reply.status(404).send({ error: 'SECRET_NOT_FOUND', message: 'Secret not found' });
    return reply.send(secret);
  });

  app.get('/api/internal/secrets/:id/audit', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = auditQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await secretAudit(app, id, parsed.data));
  });

  app.patch('/api/internal/secrets/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = secretPatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await patchSecret(app, request, id, parsed.data));
    } catch (error) {
      return sendSecretError(reply, error);
    }
  });

  app.post('/api/internal/secrets/:id/mark-rotated', { preHandler: dangerous('trust.secrets.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = markRotatedBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await markSecretRotated(app, request, id, parsed.data));
    } catch (error) {
      return sendSecretError(reply, error);
    }
  });
}
