import type { PrismaClient } from '@prisma/client';

export type TicketMessagesBackfillResult = {
  dryRun: boolean;
  messages: { tenantInternal: number; staff: number };
  tickets: { platform: number; lastMessageAtSet: number; firstResponseAtSet: number };
};

/**
 * Backfill for migration 0047_support_audience (D5):
 * - `isInternal = true` messages become TENANT_INTERNAL;
 * - `fromSA = true` messages become authorType STAFF (platformAuthorId kept) and, being Fauward replies, PUBLIC unless
 *   they were internal notes — those become STAFF_INTERNAL (they were written by Fauward, never meant for tenant users);
 * - tickets with any `fromSA` message, or created through POST /api/internal/support/tickets (PlatformAuditLog
 *   `support.ticket.create`), become audience PLATFORM;
 * - every ticket's lastMessageAt/lastMessageAuthorType come from its newest message; PLATFORM tickets get
 *   firstResponseAt from their first STAFF message.
 * Idempotent: every update only touches rows still in the pre-backfill state. `dryRun` only counts.
 */
export async function backfillTicketMessages(prisma: PrismaClient, options: { dryRun: boolean }): Promise<TicketMessagesBackfillResult> {
  const staffMessages = await prisma.ticketMessage.findMany({ where: { fromSA: true, authorType: { not: 'STAFF' } }, select: { id: true, ticketId: true, isInternal: true } });
  const tenantInternal = await prisma.ticketMessage.count({ where: { isInternal: true, fromSA: false, visibility: 'PUBLIC' } });
  const audited = await prisma.platformAuditLog.findMany({ where: { action: 'support.ticket.create', targetType: 'support_ticket', targetId: { not: null } }, select: { targetId: true } });
  const allStaffTicketIds = (await prisma.ticketMessage.findMany({ where: { fromSA: true }, select: { ticketId: true }, distinct: ['ticketId'] })).map((row) => row.ticketId);
  const platformTicketIds = [...new Set([...allStaffTicketIds, ...audited.map((row) => row.targetId).filter((id): id is string => Boolean(id))])];
  const platformToTag = await prisma.supportTicket.count({ where: { id: { in: platformTicketIds }, audience: 'END_CUSTOMER' } });

  const tickets = await prisma.supportTicket.findMany({
    where: { lastMessageAt: null },
    select: { id: true, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, fromSA: true, authorType: true } } }
  });
  const withMessages = tickets.filter((ticket) => ticket.messages.length > 0);
  const firstResponses = await prisma.ticketMessage.groupBy({ by: ['ticketId'], where: { ticketId: { in: platformTicketIds }, fromSA: true }, _min: { createdAt: true } });
  const firstResponsePending = await prisma.supportTicket.findMany({ where: { id: { in: firstResponses.map((row) => row.ticketId) }, firstResponseAt: null }, select: { id: true } });
  const pendingSet = new Set(firstResponsePending.map((row) => row.id));

  if (!options.dryRun) {
    await prisma.$transaction([
      prisma.ticketMessage.updateMany({ where: { isInternal: true, fromSA: false, visibility: 'PUBLIC' }, data: { visibility: 'TENANT_INTERNAL' } }),
      prisma.ticketMessage.updateMany({ where: { id: { in: staffMessages.filter((row) => row.isInternal).map((row) => row.id) } }, data: { authorType: 'STAFF', visibility: 'STAFF_INTERNAL' } }),
      prisma.ticketMessage.updateMany({ where: { id: { in: staffMessages.filter((row) => !row.isInternal).map((row) => row.id) } }, data: { authorType: 'STAFF' } }),
      prisma.supportTicket.updateMany({ where: { id: { in: platformTicketIds }, audience: 'END_CUSTOMER' }, data: { audience: 'PLATFORM' } })
    ]);
    for (const ticket of withMessages) {
      const newest = ticket.messages[0];
      await prisma.supportTicket.updateMany({
        where: { id: ticket.id, lastMessageAt: null },
        data: { lastMessageAt: newest.createdAt, lastMessageAuthorType: newest.fromSA ? 'STAFF' : newest.authorType }
      });
    }
    for (const row of firstResponses) {
      if (!pendingSet.has(row.ticketId) || !row._min.createdAt) continue;
      await prisma.supportTicket.updateMany({ where: { id: row.ticketId, firstResponseAt: null }, data: { firstResponseAt: row._min.createdAt } });
    }
  }

  return {
    dryRun: options.dryRun,
    messages: { tenantInternal, staff: staffMessages.length },
    tickets: { platform: platformToTag, lastMessageAtSet: withMessages.length, firstResponseAtSet: pendingSet.size }
  };
}
