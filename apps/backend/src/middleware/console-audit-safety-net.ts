import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { auditMiddleware } from '@fauward/internal-audit';
import { currentRequestActor } from '../context/request-actor.context.js';
import { platformAuditSink } from '../services/platform-audit.service.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * trust.audit (WP-5.1): exactly one PlatformAuditLog row per console mutation. Handlers write their own row
 * (writeInternalAudit, writePlatformAuditLog, auditedMutation); this hook writes a generic row only for a successful
 * mutating /api/internal request whose handler did not.
 */
export function consoleAuditSafetyNet(app: Pick<FastifyInstance, 'prisma'>) {
  const middleware = auditMiddleware({
    sink: platformAuditSink(app.prisma),
    shouldAudit: (request) => {
      const method = request.method?.toUpperCase();
      // Marking one's own bell entries read is not a platform mutation.
      if (request.url?.startsWith('/api/internal/notifications/staff')) return false;
      return Boolean(request.url?.startsWith('/api/internal/') && method && MUTATING.has(method));
    },
    auditedProbe: (request) => {
      const holder = currentRequestActor();
      return () => request.auditWritten === true || holder?.auditWritten === true;
    }
  });
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await middleware(request, reply);
  };
}
