import { randomUUID } from 'crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  AUDIT_HASH_VERSION,
  computeAuditRowHash,
  initialAuditChainCursor,
  nextAuditTimestamp,
  normalizeAuditJson,
  verifyAuditChainBatch,
  withAuditChainLock,
  type AuditChainBreakReason,
  type AuditJson,
  type AuditRowData,
  type AuditSink
} from '@fauward/internal-audit';
import { currentRequestActor } from '../context/request-actor.context.js';

// trust.audit (WP-5.1, S14): every PlatformAuditLog row is written here. One scheme (@fauward/internal-audit
// computeAuditRowHash, hashVersion 2); the writer holds the audit chain lock (@fauward/internal-audit chain-lock.ts, a
// transaction-scoped advisory lock), reads the latest row by `seq`, hashes and inserts, so concurrent writers cannot
// fork the chain. createdAt stays strictly increasing, so createdAt order is chain order too.

type PlatformAuditInput = {
  actorType: 'PLATFORM_USER' | 'TENANT_USER' | 'SYSTEM';
  actorId: string;
  actorEmail?: string | null;
  action: string;
  targetTenantId?: string | null;
  targetUserId?: string | null;
  impersonationSessionId?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditDb = PrismaClient | Prisma.TransactionClient;

export const AUDIT_CHAIN_META_ID = 'platform_audit_logs';
export const AUDIT_VERIFY_BATCH_SIZE = 1_000;

function jsonColumn(value: AuditJson): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : value;
}

/** Tells the global audit safety net (app.ts) that this request already has its audit row (one row per mutation). */
function markAuditWritten() {
  const holder = currentRequestActor();
  if (holder) holder.auditWritten = true;
}

/** Runs with the chain lock held; `tx` is the lock's transaction (or the caller's). */
async function appendLocked(tx: Prisma.TransactionClient, input: AuditRowData) {
  const latest = await tx.platformAuditLog.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true, createdAt: true } });
  const previousHash = latest?.hash ?? null;
  const row = { ...input, createdAt: nextAuditTimestamp(latest, input.createdAt) };
  return tx.platformAuditLog.create({
    data: {
      ...row,
      before: jsonColumn(row.before),
      after: jsonColumn(row.after),
      metadata: row.metadata ?? {},
      previousHash,
      hash: computeAuditRowHash(previousHash, row),
      hashVersion: AUDIT_HASH_VERSION
    }
  });
}

/** Appends one row. A root client gets its own locked transaction; a transaction client takes the lock in the caller's. */
export async function appendPlatformAuditRow(db: AuditDb, row: AuditRowData) {
  const created = await withAuditChainLock<AuditDb, Awaited<ReturnType<typeof appendLocked>>>(db, (tx) => appendLocked(tx, row));
  markAuditWritten();
  return created;
}

/** The sink @fauward/internal-audit `writeAudit` / `auditMiddleware` write through. */
export function platformAuditSink(db: AuditDb): AuditSink {
  return (row) => appendPlatformAuditRow(db, row);
}

// Accepts a transaction client too, so callers can write the audit row in the same transaction as the change.
export async function writePlatformAuditLog(db: AuditDb, input: PlatformAuditInput) {
  return appendPlatformAuditRow(db, {
    id: randomUUID(),
    createdAt: new Date(),
    actorType: input.actorType,
    actorId: input.actorId,
    actorEmail: input.actorEmail ?? null,
    actorRole: null,
    action: input.action,
    targetType: null,
    targetId: null,
    targetTenantId: input.targetTenantId ?? null,
    targetUserId: input.targetUserId ?? null,
    impersonationSessionId: input.impersonationSessionId ?? null,
    sessionId: null,
    jitSessionId: null,
    before: null,
    after: null,
    reason: input.reason ?? null,
    metadata: normalizeAuditJson(input.metadata ?? {}),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null
  });
}

export type AuditChainVerification = {
  ok: boolean;
  checked: number;
  legacy: number;
  lastSeq: number | null;
  cutoverSeq: number | null;
  firstBrokenSeq?: number;
  firstBrokenId?: string;
  reason?: AuditChainBreakReason;
};

type VerifyDb = Pick<PrismaClient, 'platformAuditLog' | 'auditChainMeta'>;

/** Walks the chain by `seq` in batches (never the whole table in memory). */
export async function verifyPlatformAuditChain(db: VerifyDb, options: { batchSize?: number } = {}): Promise<AuditChainVerification> {
  const batchSize = options.batchSize ?? AUDIT_VERIFY_BATCH_SIZE;
  const meta = await db.auditChainMeta.findUnique({ where: { id: AUDIT_CHAIN_META_ID }, select: { cutoverSeq: true } });
  const cutoverSeq = meta?.cutoverSeq ?? null;
  let cursor = initialAuditChainCursor();
  for (;;) {
    const rows = await db.platformAuditLog.findMany({
      where: cursor.lastSeq === null ? {} : { seq: { gt: cursor.lastSeq } },
      orderBy: { seq: 'asc' },
      take: batchSize
    });
    if (rows.length === 0) break;
    const step = verifyAuditChainBatch(rows, cursor, cutoverSeq);
    cursor = step.cursor;
    if (step.broken) {
      return { ok: false, checked: cursor.checked, legacy: cursor.legacy, lastSeq: cursor.lastSeq, cutoverSeq, firstBrokenSeq: step.broken.seq, firstBrokenId: step.broken.id, reason: step.broken.reason };
    }
    if (rows.length < batchSize) break;
  }
  return { ok: true, checked: cursor.checked, legacy: cursor.legacy, lastSeq: cursor.lastSeq, cutoverSeq };
}
