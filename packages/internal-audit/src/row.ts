import { randomUUID } from 'node:crypto';
import { AUDIT_HASH_VERSION, computeEntryHash, normalizeAuditJson, type AuditJson } from './hash.js';
import { redactAuditValue } from './redact.js';
import type { AuditWriteInput } from './types.js';

/** One PlatformAuditLog row as hashed (every stored column except seq, previousHash and hash). */
export type AuditRowData = {
  id: string;
  createdAt: Date;
  actorType: string;
  actorId: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetTenantId: string | null;
  targetUserId: string | null;
  impersonationSessionId: string | null;
  sessionId: string | null;
  jitSessionId: string | null;
  before: AuditJson;
  after: AuditJson;
  reason: string | null;
  metadata: AuditJson;
  ipAddress: string | null;
  userAgent: string | null;
};

/** A stored row as read back for verification (Json columns come back as plain values; absent Json is null). */
export type StoredAuditRow = Omit<AuditRowData, 'before' | 'after' | 'metadata'> & {
  before: unknown;
  after: unknown;
  metadata: unknown;
  seq: number;
  hashVersion: number;
  previousHash: string | null;
  hash: string;
};

export function auditRowHashPayload(row: Omit<StoredAuditRow, 'seq' | 'hashVersion' | 'previousHash' | 'hash'> | AuditRowData) {
  return {
    hashVersion: AUDIT_HASH_VERSION,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorType: row.actorType,
    actorId: row.actorId,
    actorEmail: row.actorEmail ?? null,
    actorRole: row.actorRole ?? null,
    action: row.action,
    targetType: row.targetType ?? null,
    targetId: row.targetId ?? null,
    targetTenantId: row.targetTenantId ?? null,
    targetUserId: row.targetUserId ?? null,
    impersonationSessionId: row.impersonationSessionId ?? null,
    sessionId: row.sessionId ?? null,
    jitSessionId: row.jitSessionId ?? null,
    before: normalizeAuditJson(row.before),
    after: normalizeAuditJson(row.after),
    reason: row.reason ?? null,
    metadata: normalizeAuditJson(row.metadata),
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null
  };
}

export function computeAuditRowHash(previousHash: string | null, row: Parameters<typeof auditRowHashPayload>[0]) {
  return computeEntryHash(previousHash, auditRowHashPayload(row));
}

/** Builds the row for a staff (console) audit entry; values are redacted and normalised to what jsonb stores. */
export function auditRowFromWriteInput(input: AuditWriteInput, now: Date = new Date(), id: string = randomUUID()): AuditRowData {
  const before = normalizeAuditJson(redactAuditValue(input.before) ?? null);
  const after = normalizeAuditJson(redactAuditValue(input.after) ?? null);
  const targetTenantId = input.target_type === 'tenant' ? input.target_id : input.target_tenant_id ?? null;
  return {
    id,
    createdAt: now,
    actorType: 'PLATFORM_USER',
    actorId: input.actor_id,
    actorEmail: input.actor_email ?? null,
    actorRole: input.actor_role,
    action: input.action,
    targetType: input.target_type,
    targetId: input.target_id,
    targetTenantId,
    targetUserId: input.target_type === 'user' ? input.target_id : null,
    impersonationSessionId: input.jit_session_id,
    sessionId: input.session_id,
    jitSessionId: input.jit_session_id,
    before,
    after,
    reason: input.reason,
    metadata: normalizeAuditJson({
      before,
      after,
      target_type: input.target_type,
      target_id: input.target_id,
      actor_role: input.actor_role,
      session_id: input.session_id,
      jit_session_id: input.jit_session_id
    }),
    ipAddress: input.ip_address,
    userAgent: input.user_agent ?? null
  };
}
