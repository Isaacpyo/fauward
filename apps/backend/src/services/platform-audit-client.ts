import type { Prisma, PrismaClient } from '@prisma/client';
import type { PlatformAuditClient } from '@fauward/internal-audit';

/** Typed adapter from Prisma to the @fauward/internal-audit writer (replaces `as unknown as` casts). */
export function platformAuditClient(prisma: PrismaClient): PlatformAuditClient {
  return {
    platformAuditLog: {
      // The writer only ever asks for the latest row's hash.
      findFirst: () => prisma.platformAuditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { hash: true } }),
      create: ({ data }) => prisma.platformAuditLog.create({ data: data as Prisma.PlatformAuditLogUncheckedCreateInput })
    }
  };
}
