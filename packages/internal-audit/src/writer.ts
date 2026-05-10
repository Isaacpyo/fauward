import type { Prisma } from '@prisma/client';
import { computeEntryHash } from './hash.js';
import { redactAuditValue } from './redact.js';
import type { AuditEntry, AuditMetadata, AuditWriteInput, PlatformAuditClient } from './types.js';

function toJson(value: unknown): Prisma.InputJsonValue {
  return (redactAuditValue(value) ?? null) as Prisma.InputJsonValue;
}

function targetColumns(input: AuditWriteInput) {
  if (input.target_type === 'tenant') return { targetTenantId: input.target_id, targetUserId: null };
  if (input.target_type === 'user') return { targetTenantId: null, targetUserId: input.target_id };
  return { targetTenantId: null, targetUserId: null };
}

export async function writeAudit(client: PlatformAuditClient, input: AuditWriteInput) {
  const previous = await client.platformAuditLog.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { hash: true }
  });
  const prevHash = previous?.hash ?? null;
  const entryWithoutHash: Omit<AuditEntry, 'hash' | 'prev_hash'> = {
    id: 'pending',
    timestamp: new Date(),
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    action: input.action,
    target_type: input.target_type,
    target_id: input.target_id,
    before: redactAuditValue(input.before) ?? null,
    after: redactAuditValue(input.after) ?? null,
    reason: input.reason,
    ip_address: input.ip_address,
    session_id: input.session_id,
    jit_session_id: input.jit_session_id
  };
  const hash = computeEntryHash(prevHash, entryWithoutHash);
  const target = targetColumns(input);
  const metadata: AuditMetadata = {
    before: entryWithoutHash.before,
    after: entryWithoutHash.after,
    target_type: input.target_type,
    target_id: input.target_id,
    actor_role: input.actor_role,
    session_id: input.session_id,
    jit_session_id: input.jit_session_id
  };

  return client.platformAuditLog.create({
    data: {
      actorType: 'PLATFORM_USER',
      actorId: input.actor_id,
      actorEmail: input.actor_email ?? null,
      actorRole: input.actor_role,
      action: input.action,
      targetType: input.target_type,
      targetId: input.target_id,
      targetTenantId: target.targetTenantId,
      targetUserId: target.targetUserId,
      impersonationSessionId: input.jit_session_id,
      sessionId: input.session_id,
      jitSessionId: input.jit_session_id,
      before: toJson(input.before),
      after: toJson(input.after),
      reason: input.reason,
      metadata: toJson(metadata),
      ipAddress: input.ip_address,
      userAgent: input.user_agent ?? null,
      previousHash: prevHash,
      hash
    }
  });
}
