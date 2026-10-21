import type { PrismaClient } from '@prisma/client';

export type TicketMessagesBackfillResult = {
  dryRun: boolean;
  messages: { tenantInternal: number; staff: number };
  tickets: { platform: number; lastMessageAtSet: number; firstResponseAtSet: number };
};

/** A message with either legacy flag set; read with SQL because the columns are not in the Prisma schema since 0079. */
export type LegacyFlagRow = { id: string; ticketId: string; isInternal: boolean; fromSA: boolean; authorType: string; visibility: string; createdAt: Date };

type BackfillDb = Pick<PrismaClient, '$queryRaw' | '$transaction' | 'ticketMessage' | 'supportTicket' | 'platformAuditLog'>;

/**
 * Backfill for migration 0047_support_audience (D5):
 * - `isInternal = true` messages become TENANT_INTERNAL;
 * - `fromSA = true` messages become authorType STAFF (platformAuthorId kept) and, being Fauward replies, PUBLIC unless
 *   they were internal notes — those become STAFF_INTERNAL (they were written by Fauward, never meant for tenant users);
 * - tickets with any `fromSA` message, or created through POST /api/internal/support/tickets (PlatformAuditLog
 *   `support.ticket.create`), become audience PLATFORM;
 * - every ticket's lastMessageAt/lastMessageAuthorType come from its newest message; PLATFORM tickets get
 *   firstResponseAt from their first STAFF message.
 * The legacy columns `isInternal`/`fromSA` are dropped by 0079 (D10), so they are read with one raw query (Prisma no
 * longer models them); this backfill must run before 0079. Idempotent: every update only touches rows still in the
 * pre-backfill state. `dryRun` only counts.
 */
export async function backfillTicketMessages(prisma: BackfillDb, options: { dryRun: boolean }): Promise<TicketMessagesBackfillResult> {
  const legacy = await prisma.$queryRaw<LegacyFlagRow[]>`
    SELECT "id", "ticketId", "isInternal", "fromSA", "authorType"::text AS "authorType", "visibility"::text AS "visibility", "createdAt"
    FROM "ticket_messages" WHERE "isInternal" OR "fromSA"`;
  const flags = new Map(legacy.map((row) => [row.id, row]));
  const staffMessages = legacy.filter((row) => row.fromSA && row.authorType !== 'STAFF');
  const tenantInternal = legacy.filter((row) => row.isInternal && !row.fromSA && row.visibility === 'PUBLIC');
  const audited = await prisma.platformAuditLog.findMany({ where: { action: 'support.ticket.create', targetType: 'support_ticket', targetId: { not: null } }, select: { targetId: true } });
  const fromSA = legacy.filter((row) => row.fromSA);
  const allStaffTicketIds = [...new Set(fromSA.map((row) => row.ticketId))];
  const platformTicketIds = [...new Set([...allStaffTicketIds, ...audited.map((row) => row.targetId).filter((id): id is string => Boolean(id))])];
  const platformToTag = await prisma.supportTicket.count({ where: { id: { in: platformTicketIds }, audience: 'END_CUSTOMER' } });

  const tickets = await prisma.supportTicket.findMany({
    where: { lastMessageAt: null },
    select: { id: true, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, createdAt: true, authorType: true } } }
  });
  const withMessages = tickets.filter((ticket) => ticket.messages.length > 0);
  const firstStaff = new Map<string, Date>();
  for (const row of fromSA) {
    if (!platformTicketIds.includes(row.ticketId)) continue;
    const current = firstStaff.get(row.ticketId);
    if (!current || row.createdAt < current) firstStaff.set(row.ticketId, row.createdAt);
  }
  const firstResponsePending = await prisma.supportTicket.findMany({ where: { id: { in: [...firstStaff.keys()] }, firstResponseAt: null }, select: { id: true } });
  const pendingSet = new Set(firstResponsePending.map((row) => row.id));

  if (!options.dryRun) {
    await prisma.$transaction([
      prisma.ticketMessage.updateMany({ where: { id: { in: tenantInternal.map((row) => row.id) }, visibility: 'PUBLIC' }, data: { visibility: 'TENANT_INTERNAL' } }),
      prisma.ticketMessage.updateMany({ where: { id: { in: staffMessages.filter((row) => row.isInternal).map((row) => row.id) } }, data: { authorType: 'STAFF', visibility: 'STAFF_INTERNAL' } }),
      prisma.ticketMessage.updateMany({ where: { id: { in: staffMessages.filter((row) => !row.isInternal).map((row) => row.id) } }, data: { authorType: 'STAFF' } }),
      prisma.supportTicket.updateMany({ where: { id: { in: platformTicketIds }, audience: 'END_CUSTOMER' }, data: { audience: 'PLATFORM' } })
    ]);
    for (const ticket of withMessages) {
      const newest = ticket.messages[0];
      await prisma.supportTicket.updateMany({
        where: { id: ticket.id, lastMessageAt: null },
        data: { lastMessageAt: newest.createdAt, lastMessageAuthorType: flags.get(newest.id)?.fromSA ? 'STAFF' : newest.authorType }
      });
    }
    for (const [ticketId, createdAt] of firstStaff) {
      if (!pendingSet.has(ticketId)) continue;
      await prisma.supportTicket.updateMany({ where: { id: ticketId, firstResponseAt: null }, data: { firstResponseAt: createdAt } });
    }
  }

  return {
    dryRun: options.dryRun,
    messages: { tenantInternal: tenantInternal.length, staff: staffMessages.length },
    tickets: { platform: platformToTag, lastMessageAtSet: withMessages.length, firstResponseAtSet: pendingSet.size }
  };
}
