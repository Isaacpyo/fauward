import { writeAudit } from './writer.js';
import type { AuditSink } from './writer.js';
import type { AuditWriteInput } from './types.js';

type AuditRequestLike = {
  method?: string;
  url?: string;
  path?: string;
  ip?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  log?: { error: (payload: unknown, message?: string) => void };
  platform?: {
    user?: { id: string; email?: string | null; role?: string };
    session?: { id: string };
  };
  auditWritten?: boolean;
  internalAudit?: Partial<Pick<AuditWriteInput, 'action' | 'target_type' | 'target_id' | 'before' | 'after' | 'reason' | 'jit_session_id'>>;
};

type AuditReplyLike = {
  statusCode?: number;
  raw?: {
    once: (event: 'finish', handler: () => void) => void;
  };
};

type AuditMiddlewareOptions = {
  sink: AuditSink;
  shouldAudit?: (request: AuditRequestLike) => boolean;
  /**
   * Called when the hook runs (inside the request's async context); the returned probe is read once the response has
   * finished. When it reports that the handler already wrote its own audit row, the safety net writes nothing (WP-5.1).
   */
  auditedProbe?: (request: AuditRequestLike) => () => boolean;
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function userAgent(request: AuditRequestLike) {
  const value = request.headers?.['user-agent'];
  return Array.isArray(value) ? value.join(', ') : value ?? null;
}

export function auditMiddleware({ sink, shouldAudit, auditedProbe }: AuditMiddlewareOptions) {
  return async (request: AuditRequestLike, reply: AuditReplyLike) => {
    const method = request.method?.toUpperCase() ?? 'GET';
    const path = request.url ?? request.path ?? 'unknown';
    const auditThis = shouldAudit ? shouldAudit(request) : path.startsWith('/api/internal/') && MUTATING_METHODS.has(method);
    if (!auditThis) return undefined;
    const alreadyAudited = auditedProbe?.(request);

    reply.raw?.once('finish', () => {
      if ((reply.statusCode ?? 500) >= 400) return;
      if (alreadyAudited?.()) return;

      const platform = request.platform;
      if (!platform?.user || !platform.session) return;

      void writeAudit(sink, {
        actor_id: platform.user.id,
        actor_email: platform.user.email ?? null,
        actor_role: platform.user.role ?? 'UNKNOWN',
        action: request.internalAudit?.action ?? `${method} ${path}`,
        target_type: request.internalAudit?.target_type ?? 'route',
        target_id: request.internalAudit?.target_id ?? path,
        before: request.internalAudit?.before ?? null,
        after: request.internalAudit?.after ?? request.body ?? null,
        reason: request.internalAudit?.reason ?? null,
        ip_address: request.ip ?? '',
        session_id: platform.session.id,
        jit_session_id: request.internalAudit?.jit_session_id ?? null,
        user_agent: userAgent(request)
      }).catch((error: unknown) => {
        request.log?.error({ err: error }, 'Failed to write internal audit log');
      });
    });

    return undefined;
  };
}
