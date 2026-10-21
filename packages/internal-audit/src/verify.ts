import { AUDIT_HASH_VERSION } from './hash.js';
import { computeAuditRowHash, type StoredAuditRow } from './row.js';

export type AuditChainBreakReason = 'PREVIOUS_HASH_MISMATCH' | 'HASH_MISMATCH' | 'LEGACY_AFTER_CUTOVER' | 'UNKNOWN_HASH_VERSION';

/** Carried from one batch to the next so the walk never holds more than one batch in memory. */
export type AuditChainCursor = { previousHash: string | null; lastSeq: number | null; v2Seen: boolean; checked: number; legacy: number };

export type AuditChainBreak = { seq: number; id: string; reason: AuditChainBreakReason };

export function initialAuditChainCursor(): AuditChainCursor {
  return { previousHash: null, lastSeq: null, v2Seen: false, checked: 0, legacy: 0 };
}

/**
 * Verifies rows in `seq` order. hashVersion-1 rows (two pre-0080 schemes, written without a lock) are accepted only up to
 * the recorded cut-over seq and only before the first v2 row; they are counted, not re-hashed. Every v2 row must link to
 * the previous row's hash and match its own recomputed hash.
 */
export function verifyAuditChainBatch(
  rows: StoredAuditRow[],
  cursor: AuditChainCursor,
  cutoverSeq: number | null
): { cursor: AuditChainCursor; broken?: AuditChainBreak } {
  const next = { ...cursor };
  for (const row of rows) {
    if (row.hashVersion === 1) {
      const pastCutover = cutoverSeq === null ? next.v2Seen : row.seq > cutoverSeq;
      if (pastCutover || next.v2Seen) return { cursor: next, broken: { seq: row.seq, id: row.id, reason: 'LEGACY_AFTER_CUTOVER' } };
      next.legacy += 1;
    } else if (row.hashVersion === AUDIT_HASH_VERSION) {
      if ((row.previousHash ?? null) !== next.previousHash) return { cursor: next, broken: { seq: row.seq, id: row.id, reason: 'PREVIOUS_HASH_MISMATCH' } };
      if (computeAuditRowHash(row.previousHash ?? null, row) !== row.hash) return { cursor: next, broken: { seq: row.seq, id: row.id, reason: 'HASH_MISMATCH' } };
      next.v2Seen = true;
    } else {
      return { cursor: next, broken: { seq: row.seq, id: row.id, reason: 'UNKNOWN_HASH_VERSION' } };
    }
    next.previousHash = row.hash;
    next.lastSeq = row.seq;
    next.checked += 1;
  }
  return { cursor: next };
}
