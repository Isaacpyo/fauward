import { describe, expect, it } from 'vitest';
import { canonicalJson, computeEntryHash } from './hash.js';
import type { AuditEntry } from './types.js';

const entry: Omit<AuditEntry, 'hash' | 'prev_hash'> = {
  id: 'audit_001',
  timestamp: new Date('2026-05-10T10:00:00.000Z'),
  actor_id: 'staff_001',
  actor_role: 'FINANCE_ADMIN',
  action: 'invoice.refund',
  target_type: 'refund',
  target_id: 'refund_001',
  before: { status: 'PAID', amount: 120 },
  after: { amount: 25, reason: 'Duplicate payment', status: 'APPROVED' },
  reason: 'Duplicate payment',
  ip_address: '127.0.0.1',
  session_id: 'session_001',
  jit_session_id: null
};

describe('audit entry hashing', () => {
  it('hashes entries deterministically', () => {
    expect(computeEntryHash(null, entry)).toBe(computeEntryHash(null, { ...entry }));
  });

  it('canonicalizes JSON with stable object key order', () => {
    expect(canonicalJson({ b: 2, a: 1, nested: { z: true, c: false } })).toBe(
      canonicalJson({ nested: { c: false, z: true }, a: 1, b: 2 })
    );
  });

  it('is key-order independent for nested before and after payloads', () => {
    const reordered: Omit<AuditEntry, 'hash' | 'prev_hash'> = {
      ...entry,
      before: { amount: 120, status: 'PAID' },
      after: { status: 'APPROVED', reason: 'Duplicate payment', amount: 25 }
    };

    expect(computeEntryHash('previous_hash', entry)).toBe(computeEntryHash('previous_hash', reordered));
  });
});
