import { computeEntryHash } from './hash.js';
import type { AuditEntry, PlatformAuditRow } from './types.js';

export function verifyChain(entries: AuditEntry[]): { ok: true; checked: number } | { ok: false; brokenIndex: number } {
  let previousHash: string | null = null;

  for (let index = 0; index < entries.length; index += 1) {
    const { hash, prev_hash, ...entryWithoutHash } = entries[index];
    const expected = computeEntryHash(previousHash, entryWithoutHash);
    if (prev_hash !== previousHash || hash !== expected) {
      return { ok: false, brokenIndex: index };
    }
    previousHash = hash;
  }

  return { ok: true, checked: entries.length };
}

export function platformRowToAuditEntry(row: PlatformAuditRow): AuditEntry {
  const metadata = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
  return {
    id: row.id,
    timestamp: row.createdAt,
    actor_id: row.actorId,
    actor_role: row.actorRole ?? String(metadata.actor_role ?? row.actorType ?? 'UNKNOWN'),
    action: row.action,
    target_type: row.targetType ?? String(metadata.target_type ?? (row.targetTenantId ? 'tenant' : row.targetUserId ? 'user' : 'unknown')),
    target_id: row.targetId ?? String(metadata.target_id ?? row.targetTenantId ?? row.targetUserId ?? ''),
    before: row.before ?? metadata.before ?? null,
    after: row.after ?? metadata.after ?? null,
    reason: row.reason ?? null,
    ip_address: row.ipAddress ?? '',
    session_id: row.sessionId ?? String(metadata.session_id ?? ''),
    jit_session_id: row.jitSessionId ?? row.impersonationSessionId ?? (metadata.jit_session_id as string | null | undefined) ?? null,
    hash: row.hash,
    prev_hash: row.previousHash ?? null
  };
}
