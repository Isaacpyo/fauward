import { describe, expect, it } from 'vitest';
import { computeEntryHash } from './hash.js';
import type { AuditEntry } from './types.js';
import { verifyChain } from './verify.js';

function entry(index: number): Omit<AuditEntry, 'hash' | 'prev_hash'> {
  return {
    id: `audit_${index}`,
    timestamp: new Date(`2026-05-10T10:0${index}:00.000Z`),
    actor_id: 'staff_001',
    actor_role: index === 1 ? 'FINANCE_ADMIN' : 'TRUST_ANALYST',
    action: index === 1 ? 'invoice.refund' : 'staff.user.update',
    target_type: index === 1 ? 'refund' : 'staff_user',
    target_id: `target_${index}`,
    before: { status: 'before', index },
    after: { status: 'after', index },
    reason: `Reason ${index}`,
    ip_address: '127.0.0.1',
    session_id: 'session_001',
    jit_session_id: null
  };
}

function chain(entries: Array<Omit<AuditEntry, 'hash' | 'prev_hash'>>): AuditEntry[] {
  let prevHash: string | null = null;
  return entries.map((item) => {
    const hash = computeEntryHash(prevHash, item);
    const chained = { ...item, hash, prev_hash: prevHash };
    prevHash = hash;
    return chained;
  });
}

describe('audit hash-chain verification', () => {
  it('accepts an intact chain', () => {
    expect(verifyChain(chain([entry(1), entry(2), entry(3)]))).toEqual({ ok: true, checked: 3 });
  });

  it('detects tampering at the correct index', () => {
    const entries = chain([entry(1), entry(2), entry(3)]);
    entries[1] = { ...entries[1], after: { status: 'tampered', index: 2 } };

    expect(verifyChain(entries)).toEqual({ ok: false, brokenIndex: 1 });
  });

  it('detects reordered entries', () => {
    const entries = chain([entry(1), entry(2), entry(3)]);

    expect(verifyChain([entries[1], entries[0], entries[2]])).toEqual({ ok: false, brokenIndex: 0 });
  });
});
