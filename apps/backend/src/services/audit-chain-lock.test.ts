import { describe, expect, it, vi } from 'vitest';
import { AUDIT_CHAIN_LOCK_SQL, auditRowFromWriteInput, nextAuditTimestamp, withAuditChainLock } from '@fauward/internal-audit';
import { appendPlatformAuditRow } from './platform-audit.service.js';

const input = {
  actor_id: 'staff-1',
  actor_role: 'PLATFORM_SUPPORT',
  action: 'user.update',
  target_type: 'user',
  target_id: 'user-1',
  before: null,
  after: null,
  reason: null,
  ip_address: '127.0.0.1',
  session_id: 'session-1',
  jit_session_id: null
};

// The chain lock (@fauward/internal-audit chain-lock.ts, #36) as the backend's single audit writer uses it (WP-5.1).
describe('audit chain lock', () => {
  it('the single writer appends inside a transaction that first takes the lock, then reads the latest row by seq', async () => {
    const calls: string[] = [];
    const tx = {
      platformAuditLog: {
        findFirst: vi.fn(async (args: { orderBy: unknown }) => { calls.push(`findFirst ${JSON.stringify(args.orderBy)}`); return { hash: 'prev', createdAt: new Date('2030-01-01T00:00:00.000Z') }; }),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => { calls.push('create'); return args.data; })
      },
      $executeRawUnsafe: vi.fn(async (query: string) => { calls.push(query); return 0; })
    };
    const client = { platformAuditLog: { findFirst: vi.fn(), create: vi.fn() }, $transaction: vi.fn(async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx)) };

    const row = (await appendPlatformAuditRow(client as never, auditRowFromWriteInput(input))) as Record<string, unknown>;

    expect(calls).toEqual([AUDIT_CHAIN_LOCK_SQL, 'findFirst {"seq":"desc"}', 'create']);
    expect(client.platformAuditLog.findFirst).not.toHaveBeenCalled();
    expect(row).toMatchObject({ previousHash: 'prev', hashVersion: 2 });
    // The stored timestamp moves past the latest row's, and it is the one that was hashed.
    expect((row.createdAt as Date).toISOString()).toBe('2030-01-01T00:00:00.001Z');
  });

  it('takes the lock in the caller transaction when given a transaction client', async () => {
    const executed: string[] = [];
    const tx = { $executeRawUnsafe: async (query: string) => { executed.push(query); return 0; } };
    await withAuditChainLock(tx, async (db) => expect(db).toBe(tx));
    expect(executed).toEqual([AUDIT_CHAIN_LOCK_SQL]);
  });

  it('runs test doubles without a database as is', async () => {
    const fake = { platformAuditLog: {} };
    await expect(withAuditChainLock(fake, async (db) => db)).resolves.toBe(fake);
  });

  it('keeps timestamps strictly increasing', () => {
    const previous = { createdAt: new Date('2026-01-01T00:00:00.500Z') };
    expect(nextAuditTimestamp(previous, new Date('2026-01-01T00:00:00.500Z')).toISOString()).toBe('2026-01-01T00:00:00.501Z');
    expect(nextAuditTimestamp(previous, new Date('2026-01-01T00:00:01.000Z')).toISOString()).toBe('2026-01-01T00:00:01.000Z');
    expect(nextAuditTimestamp(null, new Date('2026-01-01T00:00:00.000Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
