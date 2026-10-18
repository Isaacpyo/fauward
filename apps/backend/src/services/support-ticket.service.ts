import type { MessageAuthorType, MessageVisibility, Prisma, PrismaClient, SupportTicket, TicketAudience, TicketMessage } from '@prisma/client';

// customer.support (D5, WP-2.3): one place for who sees which ticket message, ticket numbering and the message write
// (message + ticket bookkeeping in one transaction). Used by the tenant routes and the console Support Desk.

export type TicketViewer = 'END_CUSTOMER' | 'TENANT_STAFF' | 'FAUWARD_STAFF';

const CUSTOMER_ROLES = new Set(['CUSTOMER_ADMIN', 'CUSTOMER_USER']);

/** A tenant user's viewer class: customers of the tenant are END_CUSTOMER, everyone else is tenant staff. */
export function tenantViewer(role: string | undefined | null): TicketViewer {
  return role && CUSTOMER_ROLES.has(role) ? 'END_CUSTOMER' : 'TENANT_STAFF';
}

/**
 * Visibility rules (D5, S11):
 * - end customer: PUBLIC only;
 * - tenant staff: PUBLIC and TENANT_INTERNAL — never STAFF_INTERNAL;
 * - Fauward staff: everything on PLATFORM tickets; PUBLIC + TENANT_INTERNAL (read-only context) on END_CUSTOMER tickets.
 */
export function visibleTo(viewer: TicketViewer, audience: TicketAudience): MessageVisibility[] {
  if (viewer === 'END_CUSTOMER') return ['PUBLIC'];
  if (viewer === 'TENANT_STAFF') return ['PUBLIC', 'TENANT_INTERNAL'];
  return audience === 'PLATFORM' ? ['PUBLIC', 'TENANT_INTERNAL', 'STAFF_INTERNAL'] : ['PUBLIC', 'TENANT_INTERNAL'];
}

export function canSeeMessage(viewer: TicketViewer, audience: TicketAudience, message: Pick<TicketMessage, 'visibility'>) {
  return visibleTo(viewer, audience).includes(message.visibility);
}

type NumberDb = Pick<PrismaClient, 'tenant' | 'supportTicket'>;

/** `<SLUG>-TKT-YYYYMM-NNNN` for a tenant's own tickets, `<SLUG>-FWD-YYYYMM-NNNN` for tickets to Fauward. */
export async function nextTicketNumber(db: NumberDb, tenantId: string, audience: TicketAudience, now = new Date()) {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  const slug = (tenant?.slug ?? 'tenant').toUpperCase();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const prefix = `${slug}-${audience === 'PLATFORM' ? 'FWD' : 'TKT'}-${yyyymm}-`;
  const count = await db.supportTicket.count({ where: { tenantId, ticketNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

export type NewTicketMessage = {
  authorType: MessageAuthorType;
  /** Tenant / end-customer User id (TENANT_USER, END_CUSTOMER). */
  authorId?: string | null;
  /** PlatformUser id (STAFF). */
  platformAuthorId?: string | null;
  visibility: MessageVisibility;
  body: string;
};

type MessageTx = Pick<Prisma.TransactionClient, 'ticketMessage' | 'supportTicket'>;

/**
 * Writes one message and, in the same transaction, bumps the ticket's updatedAt/lastMessageAt/lastMessageAuthorType
 * (ACC-SUP-4). The first PUBLIC staff reply on a PLATFORM ticket sets firstResponseAt.
 */
export async function addTicketMessage(
  db: Pick<PrismaClient, '$transaction'>,
  ticket: Pick<SupportTicket, 'id' | 'tenantId' | 'audience' | 'firstResponseAt'>,
  input: NewTicketMessage,
  now = new Date()
) {
  return db.$transaction(async (tx: MessageTx) => {
    const message = await tx.ticketMessage.create({
      data: {
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        authorId: input.authorId ?? null,
        platformAuthorId: input.platformAuthorId ?? null,
        authorType: input.authorType,
        visibility: input.visibility,
        // Legacy columns, dropped in 0062 (D5); kept consistent until then.
        isInternal: input.visibility !== 'PUBLIC',
        fromSA: input.authorType === 'STAFF',
        body: input.body,
        createdAt: now
      }
    });
    const firstStaffAnswer = ticket.audience === 'PLATFORM' && input.authorType === 'STAFF' && input.visibility === 'PUBLIC' && !ticket.firstResponseAt;
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        updatedAt: now,
        lastMessageAt: now,
        lastMessageAuthorType: input.authorType,
        ...(firstStaffAnswer ? { firstResponseAt: now } : {})
      }
    });
    return { message, ticket: updated };
  });
}

/** How the tenant sees a message author: Fauward staff are always "Fauward Support" (no staff names leak). */
export function tenantAuthorLabel(message: Pick<TicketMessage, 'authorType'>, author: { email: string; firstName: string | null; lastName: string | null } | null) {
  if (message.authorType === 'STAFF') return 'Fauward Support';
  if (message.authorType === 'SYSTEM') return 'System';
  if (!author) return 'Unknown';
  return [author.firstName, author.lastName].filter(Boolean).join(' ') || author.email;
}
