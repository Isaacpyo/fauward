// The audit chain is append-only: each row hashes the previous row's hash. Two writers that read the same "latest"
// row and then insert fork the chain, and verification reports it as tampering. Every append therefore runs under one
// transaction-scoped Postgres advisory lock, and createdAt is kept strictly increasing so the verifier's createdAt
// order is the chain order.
export const AUDIT_CHAIN_LOCK_SQL = 'SELECT pg_advisory_xact_lock(7342001)';

type RawExecutor = { $executeRawUnsafe: (query: string) => Promise<number> };
type TransactionRunner<C> = {
  $transaction: <T>(fn: (tx: C) => Promise<T>, options?: { maxWait?: number; timeout?: number }) => Promise<T>;
};
// Writers queue on the lock inside the transaction, so allow more than Prisma's 2 s / 5 s defaults.
const LOCK_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

/**
 * Runs `fn` while holding the audit chain lock.
 * - A Prisma client: opens a transaction, takes the lock, runs `fn` with the transaction client.
 * - A transaction client: takes the lock in the caller's transaction (held until it commits or rolls back).
 * - Anything else (a test double without a database): runs `fn` as is, inside the double's $transaction if it has one.
 */
export async function withAuditChainLock<C extends object, T>(client: C, fn: (db: C) => Promise<T>): Promise<T> {
  const db = client as C & Partial<TransactionRunner<C>> & Partial<RawExecutor>;
  if (typeof db.$transaction === 'function') {
    return db.$transaction(async (tx) => {
      await takeLock(tx);
      return fn(tx);
    }, LOCK_TRANSACTION_OPTIONS);
  }
  await takeLock(client);
  return fn(client);
}

async function takeLock(db: object) {
  const raw = db as Partial<RawExecutor>;
  if (typeof raw.$executeRawUnsafe === 'function') await raw.$executeRawUnsafe(AUDIT_CHAIN_LOCK_SQL);
}

/** The next row's timestamp: now, or 1 ms after the previous row when the clock has not moved on. */
export function nextAuditTimestamp(previous: { createdAt?: Date | null } | null, now = new Date()): Date {
  const after = previous?.createdAt ? previous.createdAt.getTime() + 1 : 0;
  return new Date(Math.max(now.getTime(), after));
}
