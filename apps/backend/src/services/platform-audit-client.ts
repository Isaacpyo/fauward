import type { Prisma, PrismaClient } from '@prisma/client';
import type { PlatformAuditClient } from '@fauward/internal-audit';

/** Typed adapter from Prisma to the @fauward/internal-audit writer (replaces `as unknown as` casts). */
export function platformAuditClient(prisma: PrismaClient): PlatformAuditClient {
  return {
    ...bindAuditLog(prisma),
    // writeAudit takes the audit chain lock inside this transaction (see @fauward/internal-audit chain-lock.ts).
    $transaction: (fn, options) => prisma.$transaction((tx) => fn(bindAuditLog(tx)), options)
  };
}

function bindAuditLog(db: PrismaClient | Prisma.TransactionClient): PlatformAuditClient {
  return {
    platformAuditLog: {
      // The writer only ever asks for the latest row's hash and timestamp.
      findFirst: () => db.platformAuditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { hash: true, createdAt: true } }),
      create: ({ data }) => db.platformAuditLog.create({ data: data as Prisma.PlatformAuditLogUncheckedCreateInput })
    },
    $executeRawUnsafe: (query) => db.$executeRawUnsafe(query)
  };
}
