import { describe, expect, it } from 'vitest';
import { computeAuditRowHash, type AuditRowData, type StoredAuditRow } from './row.js';
import { initialAuditChainCursor, verifyAuditChainBatch } from './verify.js';

function data(index: number): AuditRowData {
  return {
    id: `audit_${index}`,
    createdAt: new Date(Date.UTC(2026, 9, 21, 10, index)),
    actorType: 'PLATFORM_USER',
    actorId: 'staff_001',
    actorEmail: 'staff@fauward.com',
    actorRole: 'TRUST_ANALYST',
    action: 'staff.user.update',
    targetType: 'staff_user',
    targetId: `target_${index}`,
    targetTenantId: null,
    targetUserId: null,
    impersonationSessionId: null,
    sessionId: 'session_001',
    jitSessionId: null,
    before: { status: 'before', index },
    after: null,
    reason: `Reason ${index}`,
    metadata: { nested: { b: 2, a: 1 } },
    ipAddress: '127.0.0.1',
    userAgent: null
  };
}

function chain(count: number, legacy = 0): StoredAuditRow[] {
  let previousHash: string | null = null;
  return Array.from({ length: count }, (_unused, index) => {
    const row = data(index + 1);
    const isLegacy = index < legacy;
    const hash = isLegacy ? `legacy_${index}` : computeAuditRowHash(previousHash, row);
    const stored: StoredAuditRow = { ...row, seq: index + 1, hashVersion: isLegacy ? 1 : 2, previousHash: isLegacy ? null : previousHash, hash };
    previousHash = hash;
    return stored;
  });
}

describe('verifyAuditChainBatch', () => {
  it('accepts a valid v2 chain across batches', () => {
    const rows = chain(5);
    const first = verifyAuditChainBatch(rows.slice(0, 2), initialAuditChainCursor(), 0);
    const second = verifyAuditChainBatch(rows.slice(2), first.cursor, 0);
    expect(second.broken).toBeUndefined();
    expect(second.cursor.checked).toBe(5);
  });

  it('accepts legacy rows up to the cut-over and links the first v2 row to the last legacy hash', () => {
    const result = verifyAuditChainBatch(chain(4, 2), initialAuditChainCursor(), 2);
    expect(result.broken).toBeUndefined();
    expect(result.cursor).toMatchObject({ checked: 4, legacy: 2 });
  });

  it('rejects a legacy row after the cut-over', () => {
    expect(verifyAuditChainBatch(chain(3, 2), initialAuditChainCursor(), 1).broken).toEqual({ seq: 2, id: 'audit_2', reason: 'LEGACY_AFTER_CUTOVER' });
  });

  it('finds a tampered metadata value at its seq', () => {
    const rows = chain(4);
    rows[2] = { ...rows[2], metadata: { nested: { a: 1, b: 3 } } };
    expect(verifyAuditChainBatch(rows, initialAuditChainCursor(), 0).broken).toEqual({ seq: 3, id: 'audit_3', reason: 'HASH_MISMATCH' });
  });

  it('finds a deleted row as a previous-hash mismatch', () => {
    const rows = chain(4);
    expect(verifyAuditChainBatch([rows[0], rows[2], rows[3]], initialAuditChainCursor(), 0).broken).toMatchObject({ seq: 3, reason: 'PREVIOUS_HASH_MISMATCH' });
  });

  it('hashes key-order independently (jsonb reorders keys)', () => {
    const row = data(1);
    expect(computeAuditRowHash(null, row)).toBe(computeAuditRowHash(null, { ...row, metadata: { nested: { a: 1, b: 2 } } }));
  });
});
