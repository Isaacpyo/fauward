import { describe, expect, it, vi } from 'vitest';
import { AUDIT_CHAIN_LOCK_SQL, nextAuditTimestamp, withAuditChainLock, writeAudit } from '@fauward/internal-audit';
import type { PlatformAuditClient } from '@fauward/internal-audit';

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

// @fauward/internal-audit has no test runner of its own, so its chain lock is tested here.
describe('audit chain lock', () => {
  it('writeAudit appends inside a transaction that first takes the lock', async () => {
    const calls: string[] = [];
    const tx: PlatformAuditClient = {
      platformAuditLog: {
        findFirst: vi.fn(async () => { calls.push('findFirst'); return { hash: 'prev', createdAt: new Date('2026-01-01T00:00:00.000Z') }; }),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => { calls.push('create'); return args.data; })
      },
      $executeRawUnsafe: vi.fn(async (query: string) => { calls.push(query); return 0; })
    };
    const client: PlatformAuditClient = {
      platformAuditLog: { findFirst: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(async (fn) => fn(tx))
    };

    const row = (await writeAudit(client, input)) as Record<string, unknown>;

    expect(calls).toEqual([AUDIT_CHAIN_LOCK_SQL, 'findFirst', 'create']);
    expect(client.platformAuditLog.findFirst).not.toHaveBeenCalled();
    expect(row.previousHash).toBe('prev');
    expect(row.createdAt).toBeInstanceOf(Date);
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
