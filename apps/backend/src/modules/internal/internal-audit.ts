import type { FastifyRequest } from 'fastify';
import { writeAudit } from '@fauward/internal-audit';
import { platformAuditSink } from '../../services/platform-audit.service.js';

export async function writeInternalAudit(
  request: FastifyRequest,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown,
  reason?: string | null,
  options: { targetTenantId?: string | null } = {}
) {
  await writeAudit(platformAuditSink(request.server.prisma), {
    actor_id: request.platform!.user.id,
    actor_email: request.platform!.user.email,
    actor_role: request.platform!.user.role,
    action,
    target_type: targetType,
    target_id: targetId,
    before,
    after,
    reason: reason ?? null,
    ip_address: request.ip,
    session_id: request.platform!.session.id,
    jit_session_id: request.jitSessionId ?? null,
    user_agent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
    target_tenant_id: options.targetTenantId ?? null
  });
  request.auditWritten = true;
}

export function setRequestAudit(
  request: FastifyRequest,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  }
) {
  request.internalAudit = {
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
    jit_session_id: request.jitSessionId ?? null
  };
}
