import type { SupportTicket, TicketPriority } from '@prisma/client';

// Fauward Support Desk SLA targets (customer.support, WP-2.3), in minutes from ticket creation. Code-defined: changing
// a target is a reviewed change, and the console SLA page reads them from GET /api/internal/support/sla.

export const SUPPORT_SLA_MINUTES: Record<TicketPriority, { firstResponse: number; resolution: number }> = {
  URGENT: { firstResponse: 60, resolution: 8 * 60 },
  HIGH: { firstResponse: 4 * 60, resolution: 24 * 60 },
  NORMAL: { firstResponse: 8 * 60, resolution: 72 * 60 },
  LOW: { firstResponse: 24 * 60, resolution: 120 * 60 }
};

export type SlaBreach = 'FIRST_RESPONSE' | 'RESOLUTION';

const OPEN_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER']);

/** Which target an open PLATFORM ticket has missed at `now`, if any (first response is checked first). */
export function slaBreach(ticket: Pick<SupportTicket, 'priority' | 'status' | 'createdAt' | 'firstResponseAt'>, now = new Date()): SlaBreach | null {
  if (!OPEN_STATUSES.has(ticket.status)) return null;
  const targets = SUPPORT_SLA_MINUTES[ticket.priority];
  const ageMinutes = (now.getTime() - ticket.createdAt.getTime()) / 60_000;
  if (!ticket.firstResponseAt && ageMinutes > targets.firstResponse) return 'FIRST_RESPONSE';
  if (ageMinutes > targets.resolution) return 'RESOLUTION';
  return null;
}

/** Earliest createdAt that can still be within every target of the priority (used to narrow breach queries). */
export function breachCutoff(priority: TicketPriority, now = new Date()) {
  return new Date(now.getTime() - SUPPORT_SLA_MINUTES[priority].firstResponse * 60_000);
}
