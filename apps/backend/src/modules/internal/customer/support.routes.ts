import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma, SupportTicket, TicketMessage, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { addTicketMessage, nextTicketNumber, visibleTo } from '../../../services/support-ticket.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { notifyTenantAdmins, notifyTenantUser } from '../../../services/platform-notifier.service.js';
import { SUPPORT_MACROS } from '../../../config/support-macros.js';
import { SUPPORT_SLA_MINUTES, slaBreach } from '../../../config/support-sla.js';
import { writeInternalAudit } from '../internal-audit.js';

// customer.support — Fauward Support Desk (D5, WP-2.3). Lists PLATFORM tickets only (ACC-SUP-6); staff replies are
// authored as STAFF (never as a tenant user) and are PUBLIC or STAFF_INTERNAL; every message bumps the ticket
// (ACC-SUP-4). Tenant replies come in through /api/v1/tenants/me/fauward-tickets.

const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const satisfies readonly TicketStatus[];
const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const CATEGORIES = ['DELIVERY_ISSUE', 'PAYMENT_ISSUE', 'DAMAGED_GOODS', 'WRONG_ADDRESS', 'TRACKING_ISSUE', 'RETURN_REQUEST', 'BILLING_QUERY', 'OTHER'] as const;

const listQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : []))
    .pipe(z.array(z.enum(STATUSES))),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  breached: z.enum(['true', 'false']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional()
});
const createBody = z.object({
  tenantId: z.string().min(1),
  subject: z.string().trim().min(3).max(200),
  category: z.enum(CATEGORIES).default('OTHER'),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  body: z.string().trim().min(10).max(10_000),
  requesterUserId: z.string().min(1).optional()
});
const updateBody = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    category: z.enum(CATEGORIES).optional(),
    assignedPlatformUserId: z.string().min(1).nullable().optional()
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), 'Nothing to change.');
const messageBody = z.object({
  body: z.string().trim().min(1).max(10_000),
  visibility: z.enum(['PUBLIC', 'STAFF_INTERNAL']).default('PUBLIC')
});

function validation(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: 'VALIDATION', message: error.issues.map((issue) => issue.message).join(' ') });
}

const read = { preHandler: [authenticatePlatformSession, requireConsolePermission('customer.support.read')] };
const write = { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('customer.support.write')] };

type TenantLabel = { id: string; name: string; slug: string };
type PlatformLabel = { id: string; email: string; name: string | null };

async function platformUsers(app: FastifyInstance, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map<string, PlatformLabel>();
  const users = await app.prisma.platformUser.findMany({ where: { id: { in: unique } }, select: { id: true, email: true, name: true } });
  return new Map(users.map((user) => [user.id, user]));
}

function presentTicket(ticket: SupportTicket & { tenant: TenantLabel }, staff: ReadonlyMap<string, PlatformLabel>, now = new Date()) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    tenant: ticket.tenant,
    assignee: ticket.assignedPlatformUserId ? staff.get(ticket.assignedPlatformUserId) ?? { id: ticket.assignedPlatformUserId, email: 'unknown', name: null } : null,
    lastMessageAt: ticket.lastMessageAt?.toISOString() ?? null,
    lastMessageAuthorType: ticket.lastMessageAuthorType,
    firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
    slaBreachedAt: ticket.slaBreachedAt?.toISOString() ?? null,
    slaBreach: slaBreach(ticket, now),
    linkedTicketId: ticket.linkedTicketId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null
  };
}

type MessageWithAuthor = TicketMessage & { author: { id: string; email: string; firstName: string | null; lastName: string | null } | null };

function presentMessage(message: MessageWithAuthor, staff: ReadonlyMap<string, PlatformLabel>) {
  const staffUser = message.platformAuthorId ? staff.get(message.platformAuthorId) : undefined;
  const authorLabel =
    message.authorType === 'STAFF'
      ? staffUser?.name ?? staffUser?.email ?? 'Fauward staff'
      : message.author
        ? [message.author.firstName, message.author.lastName].filter(Boolean).join(' ') || message.author.email
        : message.authorType === 'SYSTEM'
          ? 'System'
          : 'Unknown';
  return { id: message.id, authorType: message.authorType, authorLabel, visibility: message.visibility, body: message.body, createdAt: message.createdAt.toISOString() };
}

async function platformTicket(app: FastifyInstance, id: string) {
  return app.prisma.supportTicket.findFirst({ where: { id, audience: 'PLATFORM' }, include: { tenant: { select: { id: true, name: true, slug: true } } } });
}

/** Requester first, then the tenant's admins; the tenant sees "Fauward Support" (D5). */
async function notifyTenantOfReply(app: FastifyInstance, ticket: SupportTicket, text: string) {
  const input = {
    tenantId: ticket.tenantId,
    event: 'support.reply_from_fauward',
    title: `Fauward Support replied to ${ticket.ticketNumber}`,
    body: text.length > 200 ? `${text.slice(0, 200)}…` : text,
    link: `/help/tickets/${ticket.id}`,
    email: { template: 'support_reply_from_fauward' as const, data: { ticketNumber: ticket.ticketNumber, excerpt: text.slice(0, 500) } }
  };
  if (ticket.customerId) await notifyTenantUser(app, { ...input, userId: ticket.customerId });
  await notifyTenantAdmins(app, ticket.customerId ? { ...input, email: undefined } : input);
}

export async function registerConsoleSupportRoutes(app: FastifyInstance) {
  app.get('/api/internal/support/tickets', read, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const query = parsed.data;
    const me = request.platform!.user.id;
    const where: Prisma.SupportTicketWhereInput = {
      audience: 'PLATFORM',
      ...(query.status.length > 0 ? { status: { in: query.status } } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.assignee === 'me' ? { assignedPlatformUserId: me } : query.assignee === 'unassigned' ? { assignedPlatformUserId: null } : query.assignee ? { assignedPlatformUserId: query.assignee } : {}),
      ...(query.breached === 'true' ? { slaBreachedAt: { not: null }, status: { in: OPEN_STATUSES } } : {}),
      ...(query.q ? { OR: [{ ticketNumber: { contains: query.q, mode: 'insensitive' } }, { subject: { contains: query.q, mode: 'insensitive' } }] } : {})
    };
    const [rows, total] = await Promise.all([
      app.prisma.supportTicket.findMany({
        where,
        include: { tenant: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
      }),
      app.prisma.supportTicket.count({ where })
    ]);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const staff = await platformUsers(app, page.map((row) => row.assignedPlatformUserId));
    return reply.send({ data: page.map((row) => presentTicket(row, staff)), total, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null });
  });

  app.get('/api/internal/support/tickets/:id', read, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await platformTicket(app, id);
    if (!ticket) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Ticket not found' });
    const [messages, linked, requester] = await Promise.all([
      app.prisma.ticketMessage.findMany({
        where: { ticketId: ticket.id, tenantId: ticket.tenantId },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, email: true, firstName: true, lastName: true } } }
      }),
      ticket.linkedTicketId
        ? app.prisma.supportTicket.findFirst({
            where: { id: ticket.linkedTicketId, tenantId: ticket.tenantId },
            include: {
              messages: {
                // An END_CUSTOMER ticket is read-only context for Fauward: PUBLIC + TENANT_INTERNAL (D5).
                where: { visibility: { in: visibleTo('FAUWARD_STAFF', 'END_CUSTOMER') } },
                orderBy: { createdAt: 'asc' },
                include: { author: { select: { id: true, email: true, firstName: true, lastName: true } } }
              }
            }
          })
        : null,
      ticket.customerId ? app.prisma.user.findFirst({ where: { id: ticket.customerId, tenantId: ticket.tenantId }, select: { id: true, email: true, firstName: true, lastName: true, role: true } }) : null
    ]);
    const staff = await platformUsers(app, [ticket.assignedPlatformUserId, ...messages.map((message) => message.platformAuthorId)]);
    return reply.send({
      ticket: presentTicket(ticket, staff),
      requester,
      messages: messages.map((message) => presentMessage(message, staff)),
      linkedTicket: linked
        ? {
            id: linked.id,
            ticketNumber: linked.ticketNumber,
            subject: linked.subject,
            audience: linked.audience,
            status: linked.status,
            messages: linked.audience === 'END_CUSTOMER' ? linked.messages.map((message) => presentMessage(message, staff)) : []
          }
        : null
    });
  });

  // Proactive outreach: staff open a PLATFORM ticket for a tenant; the tenant sees it under Help → Contact Fauward.
  app.post('/api/internal/support/tickets', write, async (request, reply) => {
    const parsed = createBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const input = parsed.data;
    const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, name: true, slug: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    if (input.requesterUserId) {
      const user = await app.prisma.user.findFirst({ where: { id: input.requesterUserId, tenantId: tenant.id }, select: { id: true } });
      if (!user) return reply.status(400).send({ error: 'VALIDATION', message: 'The requester is not a user of this tenant.' });
    }
    const now = new Date();
    const ticketNumber = await nextTicketNumber(app.prisma, tenant.id, 'PLATFORM', now);
    const ticket = await app.prisma.supportTicket.create({
      data: {
        tenantId: tenant.id,
        ticketNumber,
        audience: 'PLATFORM',
        customerId: input.requesterUserId ?? null,
        subject: input.subject,
        category: input.category,
        priority: input.priority,
        assignedPlatformUserId: request.platform!.user.id,
        lastMessageAt: now,
        lastMessageAuthorType: 'STAFF',
        firstResponseAt: now,
        messages: { create: { tenantId: tenant.id, authorType: 'STAFF', platformAuthorId: request.platform!.user.id, visibility: 'PUBLIC', fromSA: true, body: input.body, createdAt: now } }
      }
    });
    await writeInternalAudit(request, 'support.ticket.create', 'support_ticket', ticket.id, null, { ticketNumber, subject: ticket.subject }, null, { targetTenantId: tenant.id });
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      {
        service: 'customer.support',
        type: 'ticket.created',
        tenantId: tenant.id,
        ...staffActor(request),
        subjectType: 'support_ticket',
        subjectId: ticket.id,
        summary: `Fauward opened ${ticketNumber} for ${tenant.name}: ${ticket.subject}`,
        consoleLink: `/customer/support/tickets/${ticket.id}`,
        dedupeKey: `ticket.created:${ticket.id}`
      }
    );
    await notifyTenantOfReply(app, ticket, input.body);
    return reply.status(201).send({ ticket: presentTicket({ ...ticket, tenant }, await platformUsers(app, [ticket.assignedPlatformUserId])) });
  });

  app.patch('/api/internal/support/tickets/:id', write, async (request, reply) => {
    const parsed = updateBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    const ticket = await platformTicket(app, id);
    if (!ticket) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Ticket not found' });
    const input = parsed.data;
    if (input.assignedPlatformUserId) {
      const assignee = await app.prisma.platformUser.findFirst({ where: { id: input.assignedPlatformUserId, status: 'ACTIVE' }, select: { id: true } });
      if (!assignee) return reply.status(400).send({ error: 'VALIDATION', message: 'Assignee is not an active staff member.' });
    }
    const now = new Date();
    const statusChanged = input.status !== undefined && input.status !== ticket.status;
    const updated = await app.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.assignedPlatformUserId !== undefined ? { assignedPlatformUserId: input.assignedPlatformUserId } : {}),
        ...(statusChanged
          ? {
              status: input.status,
              resolvedAt: input.status === 'RESOLVED' ? now : input.status === 'CLOSED' ? ticket.resolvedAt ?? now : null,
              closedAt: input.status === 'CLOSED' ? now : null
            }
          : {})
      }
    });
    await writeInternalAudit(
      request,
      'support.ticket.update',
      'support_ticket',
      ticket.id,
      { status: ticket.status, priority: ticket.priority, category: ticket.category, assignedPlatformUserId: ticket.assignedPlatformUserId },
      { status: updated.status, priority: updated.priority, category: updated.category, assignedPlatformUserId: updated.assignedPlatformUserId },
      null,
      { targetTenantId: ticket.tenantId }
    );
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      {
        service: 'customer.support',
        type: statusChanged ? 'ticket.status_changed' : 'ticket.updated',
        tenantId: ticket.tenantId,
        ...staffActor(request),
        subjectType: 'support_ticket',
        subjectId: ticket.id,
        summary: statusChanged ? `${ticket.ticketNumber} moved from ${ticket.status} to ${updated.status}` : `${ticket.ticketNumber} updated`,
        consoleLink: `/customer/support/tickets/${ticket.id}`,
        metadata: { from: ticket.status, to: updated.status }
      }
    );
    if (statusChanged && (updated.status === 'RESOLVED' || updated.status === 'CLOSED')) {
      const input = {
        tenantId: ticket.tenantId,
        event: 'support.ticket_resolved',
        title: `${ticket.ticketNumber} ${updated.status === 'RESOLVED' ? 'resolved' : 'closed'} by Fauward Support`,
        body: ticket.subject,
        link: `/help/tickets/${ticket.id}`,
        email: { template: 'ticket_resolved' as const, data: { ticketNumber: ticket.ticketNumber, subject: ticket.subject } }
      };
      if (ticket.customerId) await notifyTenantUser(app, { ...input, userId: ticket.customerId });
      else await notifyTenantAdmins(app, input);
    }
    const staff = await platformUsers(app, [updated.assignedPlatformUserId]);
    return reply.send({ ticket: presentTicket({ ...updated, tenant: ticket.tenant }, staff) });
  });

  app.post('/api/internal/support/tickets/:id/messages', write, async (request, reply) => {
    const parsed = messageBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    const ticket = await platformTicket(app, id);
    if (!ticket) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Ticket not found' });
    if (ticket.status === 'CLOSED') return reply.status(409).send({ error: 'TICKET_CLOSED', message: 'Reopen the ticket before replying.' });

    const { message, ticket: bumped } = await addTicketMessage(app.prisma, ticket, {
      authorType: 'STAFF',
      platformAuthorId: request.platform!.user.id,
      visibility: parsed.data.visibility,
      body: parsed.data.body
    });
    await writeInternalAudit(request, 'support.ticket.reply', 'support_ticket', ticket.id, null, { messageId: message.id, visibility: message.visibility }, null, { targetTenantId: ticket.tenantId });
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      {
        service: 'customer.support',
        type: parsed.data.visibility === 'PUBLIC' ? 'ticket.replied.staff' : 'ticket.note_added',
        tenantId: ticket.tenantId,
        ...staffActor(request),
        subjectType: 'support_ticket',
        subjectId: ticket.id,
        summary: parsed.data.visibility === 'PUBLIC' ? `Fauward replied on ${ticket.ticketNumber}` : `Internal note on ${ticket.ticketNumber}`,
        consoleLink: `/customer/support/tickets/${ticket.id}`,
        dedupeKey: `ticket.message:${message.id}`
      }
    );
    if (parsed.data.visibility === 'PUBLIC') await notifyTenantOfReply(app, ticket, parsed.data.body);
    const staff = await platformUsers(app, [request.platform!.user.id, bumped.assignedPlatformUserId]);
    return reply.status(201).send({
      message: presentMessage({ ...message, author: null }, staff),
      ticket: presentTicket({ ...bumped, tenant: ticket.tenant }, staff)
    });
  });

  app.get('/api/internal/support/sla', read, async (_request, reply) => {
    const now = new Date();
    const open = await app.prisma.supportTicket.findMany({
      where: { audience: 'PLATFORM', status: { in: OPEN_STATUSES } },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500
    });
    const breaching = open.filter((ticket) => slaBreach(ticket, now) !== null);
    const staff = await platformUsers(app, breaching.map((ticket) => ticket.assignedPlatformUserId));
    return reply.send({
      targets: Object.entries(SUPPORT_SLA_MINUTES).map(([priority, target]) => ({ priority, firstResponseMinutes: target.firstResponse, resolutionMinutes: target.resolution })),
      openTickets: open.length,
      breaches: breaching.map((ticket) => presentTicket(ticket, staff, now))
    });
  });

  app.get('/api/internal/support/macros', read, async (_request, reply) => reply.send({ data: SUPPORT_MACROS }));
}
