import { writeAudit } from './writer.js';
import type { AuditWriteInput, PlatformAuditClient } from './types.js';

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
  internalAudit?: Partial<Pick<AuditWriteInput, 'action' | 'target_type' | 'target_id' | 'before' | 'after' | 'reason' | 'jit_session_id'>>;
};

type AuditReplyLike = {
  statusCode?: number;
  raw?: {
    once: (event: 'finish', handler: () => void) => void;
  };
};

type AuditMiddlewareOptions = {
  prisma: PlatformAuditClient;
  shouldAudit?: (request: AuditRequestLike) => boolean;
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function userAgent(request: AuditRequestLike) {
  const value = request.headers?.['user-agent'];
  return Array.isArray(value) ? value.join(', ') : value ?? null;
}

export function auditMiddleware({ prisma, shouldAudit }: AuditMiddlewareOptions) {
  return async (request: AuditRequestLike, reply: AuditReplyLike) => {
    const method = request.method?.toUpperCase() ?? 'GET';
    const path = request.url ?? request.path ?? 'unknown';
    const auditThis = shouldAudit ? shouldAudit(request) : path.startsWith('/api/internal/') && MUTATING_METHODS.has(method);
    if (!auditThis) return undefined;

    reply.raw?.once('finish', () => {
      if ((reply.statusCode ?? 500) >= 400) return;

      const platform = request.platform;
      if (!platform?.user || !platform.session) return;

      void writeAudit(prisma, {
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
