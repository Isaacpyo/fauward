import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma, SupportTicket, TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { createInAppNotifications } from '../notifications/notifications.routes.js';
import { addTicketMessage, nextTicketNumber, tenantAuthorLabel, tenantViewer, visibleTo } from '../../services/support-ticket.service.js';
import { recordAndPublishActivity } from '../../services/platform-activity.service.js';
import { notifyStaff } from '../../services/platform-notifier.service.js';

// A tenant's own support desk (END_CUSTOMER tickets, D5). Tickets to Fauward live in fauward-tickets.routes.ts and are
// never listed or opened here. Message visibility comes from ticket-visibility rules: customers see PUBLIC only, tenant
// staff PUBLIC + TENANT_INTERNAL, nobody here ever sees STAFF_INTERNAL (S11).

const STAFF_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'] as const;
const ESCALATE_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER'] as const;
const CATEGORIES = ['DELIVERY_ISSUE', 'PAYMENT_ISSUE', 'DAMAGED_GOODS', 'WRONG_ADDRESS', 'TRACKING_ISSUE', 'RETURN_REQUEST', 'BILLING_QUERY', 'OTHER'] as const satisfies readonly TicketCategory[];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const satisfies readonly TicketPriority[];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const satisfies readonly TicketStatus[];

const createBody = z.object({
  subject: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES).default('OTHER'),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  shipmentId: z.string().min(1).optional(),
  message: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional()
});
const messageBody = z.object({
  body: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1).optional(),
  isInternal: z.boolean().optional()
});
const updateBody = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedTo: z.string().min(1).nullable().optional()
});
const escalateBody = z.object({ reason: z.string().trim().min(10, 'Say why Fauward needs to step in (at least 10 characters).').max(2000) });

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function validation(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: 'VALIDATION', message: error.issues.map((issue) => issue.message).join(' ') });
}

const userSelect = { id: true, email: true, firstName: true, lastName: true, role: true } as const;

async function endCustomerTicket(app: FastifyInstance, tenantId: string, id: string) {
  return app.prisma.supportTicket.findFirst({ where: { id, tenantId, audience: 'END_CUSTOMER' } });
}

function activityDeps(app: FastifyInstance, request: FastifyRequest) {
  return { prisma: app.prisma, redis: app.redis, log: request.log };
}

export async function registerSupportRoutes(app: FastifyInstance) {
  app.get('/api/v1/support/tickets', { preHandler: [authenticate, requireRole([...STAFF_ROLES])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const query = request.query as { status?: string; priority?: string; category?: string; assignedTo?: string; search?: string; page?: string; limit?: string };
    const take = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const page = Math.max(1, Number(query.page) || 1);

    const where: Prisma.SupportTicketWhereInput = { tenantId, audience: 'END_CUSTOMER' };
    if (query.status && (STATUSES as readonly string[]).includes(query.status)) where.status = query.status as TicketStatus;
    if (query.priority && (PRIORITIES as readonly string[]).includes(query.priority)) where.priority = query.priority as TicketPriority;
    if (query.category && (CATEGORIES as readonly string[]).includes(query.category)) where.category = query.category as TicketCategory;
    if (query.assignedTo) where.assignedTo = query.assignedTo;
    if (query.search) {
      where.OR = [
        { ticketNumber: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
        { customer: { email: { contains: query.search, mode: 'insensitive' } } }
      ];
    }

    const [tickets, total] = await Promise.all([
      app.prisma.supportTicket.findMany({
        where,
        include: {
          customer: { select: { id: true, email: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
          shipment: { select: { id: true, trackingNumber: true, status: true } }
        },
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take,
        skip: (page - 1) * take
      }),
      app.prisma.supportTicket.count({ where })
    ]);
    return reply.send({ tickets, total, page, pageSize: take });
  });

  app.post('/api/v1/support/tickets', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const authorId = request.user?.sub;
    if (!tenantId) return;
    if (!authorId) return reply.status(401).send({ error: 'Unauthorized' });
    const parsed = createBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const text = parsed.data.message ?? parsed.data.body;
    if (!text) return reply.status(400).send({ error: 'subject and message are required' });

    const viewer = tenantViewer(request.user?.role);
    const now = new Date();
    const ticketNumber = await nextTicketNumber(app.prisma, tenantId, 'END_CUSTOMER', now);
    const ticket = await app.prisma.supportTicket.create({
      data: {
        tenantId,
        ticketNumber,
        audience: 'END_CUSTOMER',
        customerId: authorId,
        shipmentId: parsed.data.shipmentId,
        subject: parsed.data.subject,
        category: parsed.data.category,
        priority: parsed.data.priority,
        lastMessageAt: now,
        lastMessageAuthorType: viewer === 'END_CUSTOMER' ? 'END_CUSTOMER' : 'TENANT_USER',
        messages: {
          create: {
            tenantId,
            authorId,
            authorType: viewer === 'END_CUSTOMER' ? 'END_CUSTOMER' : 'TENANT_USER',
            visibility: 'PUBLIC',
            body: text,
            createdAt: now
          }
        }
      },
      include: { messages: true }
    });

    const adminUsers = await app.prisma.user.findMany({
      where: { tenantId, role: { in: ['TENANT_ADMIN', 'TENANT_MANAGER'] }, isActive: true },
      select: { id: true }
    });
    await createInAppNotifications(app, {
      tenantId,
      userIds: adminUsers.map((user) => user.id),
      type: 'ticket_opened',
      title: `New ticket ${ticket.ticketNumber}`,
      body: parsed.data.subject,
      link: `/support/${ticket.id}`
    });

    return reply.status(201).send(ticket);
  });

  app.get('/api/v1/support/tickets/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    if (!tenantId) return;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const viewer = tenantViewer(request.user?.role);

    const ticket = await app.prisma.supportTicket.findFirst({
      where: { id, tenantId, audience: 'END_CUSTOMER' },
      include: {
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        shipment: { select: { id: true, trackingNumber: true } },
        linkedTicket: { select: { id: true, ticketNumber: true, status: true, audience: true } },
        messages: {
          where: { visibility: { in: visibleTo(viewer, 'END_CUSTOMER') } },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: userSelect } }
        }
      }
    });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    if (viewer === 'END_CUSTOMER' && ticket.customerId !== userId) return reply.status(403).send({ error: 'Forbidden' });

    return reply.send({
      ...ticket,
      // A customer never learns that the tenant escalated to Fauward.
      linkedTicket: viewer === 'END_CUSTOMER' ? null : ticket.linkedTicket,
      messages: ticket.messages.map((message) => ({ ...message, authorLabel: tenantAuthorLabel(message, message.author) }))
    });
  });

  const reply = async (request: FastifyRequest, response: FastifyReply) => {
    const tenantId = getTenantId(request, response);
    const authorId = request.user?.sub;
    if (!tenantId) return;
    if (!authorId) return response.status(401).send({ error: 'Unauthorized' });
    const parsed = messageBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(response, parsed.error);
    const text = parsed.data.body ?? parsed.data.message;
    if (!text) return response.status(400).send({ error: 'body is required' });

    const { id } = request.params as { id: string };
    const ticket = await endCustomerTicket(app, tenantId, id);
    if (!ticket) return response.status(404).send({ error: 'Ticket not found' });
    if (ticket.status === 'CLOSED') return response.status(400).send({ error: 'Ticket is closed' });

    const viewer = tenantViewer(request.user?.role);
    if (viewer === 'END_CUSTOMER' && ticket.customerId !== authorId) return response.status(403).send({ error: 'Forbidden' });
    const internal = parsed.data.isInternal === true;
    if (internal && viewer !== 'TENANT_STAFF') return response.status(403).send({ error: 'Only staff can add internal notes' });

    const { message } = await addTicketMessage(app.prisma, ticket, {
      authorType: viewer === 'END_CUSTOMER' ? 'END_CUSTOMER' : 'TENANT_USER',
      authorId,
      visibility: internal ? 'TENANT_INTERNAL' : 'PUBLIC',
      body: text
    });

    if (!internal) {
      const notifyUserIds = viewer === 'TENANT_STAFF' ? (ticket.customerId ? [ticket.customerId] : []) : ([ticket.assignedTo].filter(Boolean) as string[]);
      await createInAppNotifications(app, {
        tenantId,
        userIds: notifyUserIds,
        type: viewer === 'TENANT_STAFF' ? 'ticket_reply_from_staff' : 'ticket_reply_from_customer',
        title: `New reply on ${ticket.ticketNumber}`,
        body: text,
        link: `/support/${ticket.id}`
      });
    }
    return response.status(201).send(message);
  };
  app.post('/api/v1/support/tickets/:id/messages', { preHandler: [authenticate] }, reply);
  app.post('/api/v1/support/tickets/:id/reply', { preHandler: [authenticate] }, reply);

  app.patch('/api/v1/support/tickets/:id', { preHandler: [authenticate, requireRole([...STAFF_ROLES])] }, async (request, response) => {
    const tenantId = getTenantId(request, response);
    if (!tenantId) return;
    const parsed = updateBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(response, parsed.error);
    const { id } = request.params as { id: string };
    const ticket = await endCustomerTicket(app, tenantId, id);
    if (!ticket) return response.status(404).send({ error: 'Ticket not found' });
    if (parsed.data.assignedTo) {
      const assignee = await app.prisma.user.findFirst({ where: { id: parsed.data.assignedTo, tenantId }, select: { id: true } });
      if (!assignee) return response.status(400).send({ error: 'Assignee not found in this workspace' });
    }
    const updated = await app.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: parsed.data.status, priority: parsed.data.priority, ...(parsed.data.assignedTo !== undefined ? { assignedTo: parsed.data.assignedTo } : {}) }
    });
    return response.send(updated);
  });

  app.post('/api/v1/support/tickets/:id/resolve', { preHandler: [authenticate, requireRole([...STAFF_ROLES])] }, async (request, response) => {
    const tenantId = getTenantId(request, response);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const ticket = await endCustomerTicket(app, tenantId, id);
    if (!ticket) return response.status(404).send({ error: 'Ticket not found' });
    const updated = await app.prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
    if (ticket.customerId) {
      await createInAppNotifications(app, {
        tenantId,
        userIds: [ticket.customerId],
        type: 'ticket_resolved',
        title: `Ticket ${ticket.ticketNumber} resolved`,
        body: 'Your support ticket has been resolved.',
        link: `/support/${ticket.id}`
      });
    }
    return response.send(updated);
  });

  app.post('/api/v1/support/tickets/:id/close', { preHandler: [authenticate, requireRole([...STAFF_ROLES])] }, async (request, response) => {
    const tenantId = getTenantId(request, response);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const ticket = await endCustomerTicket(app, tenantId, id);
    if (!ticket) return response.status(404).send({ error: 'Ticket not found' });
    if (ticket.status !== 'RESOLVED') return response.status(400).send({ error: 'Ticket must be resolved before closing' });
    const updated = await app.prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    return response.send(updated);
  });

  // L1 escalation (ACC-SUP-5): the tenant asks Fauward to step in on one of its customer tickets. Creates a linked
  // PLATFORM ticket with a summary (never the TENANT_INTERNAL notes) and links both ways.
  app.post('/api/v1/support/tickets/:id/escalate-to-fauward', { preHandler: [authenticate, requireRole([...ESCALATE_ROLES])] }, async (request, response) => {
    const tenantId = getTenantId(request, response);
    const authorId = request.user?.sub;
    if (!tenantId) return;
    if (!authorId) return response.status(401).send({ error: 'Unauthorized' });
    const parsed = escalateBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(response, parsed.error);
    const { id } = request.params as { id: string };
    const source = await app.prisma.supportTicket.findFirst({
      where: { id, tenantId, audience: 'END_CUSTOMER' },
      include: { messages: { where: { visibility: 'PUBLIC' }, orderBy: { createdAt: 'desc' }, take: 3 } }
    });
    if (!source) return response.status(404).send({ error: 'Ticket not found' });
    if (source.linkedTicketId) return response.status(409).send({ error: 'ALREADY_ESCALATED', linkedTicketId: source.linkedTicketId });

    const now = new Date();
    const ticketNumber = await nextTicketNumber(app.prisma, tenantId, 'PLATFORM', now);
    const excerpt = source.messages
      .reverse()
      .map((message) => `> ${message.body.slice(0, 400)}`)
      .join('\n');
    const summary = [`Escalated from ${source.ticketNumber}: ${source.subject}`, '', parsed.data.reason, excerpt ? `\nLatest customer messages:\n${excerpt}` : ''].join('\n');

    const platformTicket = await app.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          tenantId,
          ticketNumber,
          audience: 'PLATFORM',
          customerId: authorId,
          shipmentId: source.shipmentId,
          subject: `Escalated: ${source.subject}`.slice(0, 200),
          category: source.category,
          priority: source.priority,
          linkedTicketId: source.id,
          lastMessageAt: now,
          lastMessageAuthorType: 'TENANT_USER',
          messages: { create: { tenantId, authorId, authorType: 'TENANT_USER', visibility: 'PUBLIC', body: summary, createdAt: now } }
        }
      });
      await tx.supportTicket.update({ where: { id: source.id }, data: { linkedTicketId: created.id } });
      return created;
    });

    const tenantName = request.tenant?.name ?? request.tenant?.slug ?? tenantId;
    await recordAndPublishActivity(activityDeps(app, request), {
      service: 'customer.support',
      type: 'ticket.escalated',
      tenantId,
      actorType: 'TENANT_USER',
      actorId: authorId,
      actorLabel: request.user?.email ?? 'Tenant user',
      subjectType: 'support_ticket',
      subjectId: platformTicket.id,
      summary: `${tenantName} escalated ${source.ticketNumber} to Fauward`,
      severity: 'ATTENTION',
      consoleLink: `/customer/support/tickets/${platformTicket.id}`,
      dedupeKey: `ticket.escalated:${platformTicket.id}`,
      metadata: { sourceTicketId: source.id, ticketNumber: platformTicket.ticketNumber }
    });
    await notifyStaff(app, {
      permission: 'customer.support.write',
      event: 'ticket.escalated',
      title: `${tenantName} escalated a customer ticket`,
      body: parsed.data.reason.slice(0, 200),
      link: `/customer/support/tickets/${platformTicket.id}`,
      severity: 'ATTENTION',
      tenantId
    });
    return response.status(201).send({ ticket: presentLink(platformTicket), sourceTicketId: source.id });
  });
}

function presentLink(ticket: Pick<SupportTicket, 'id' | 'ticketNumber' | 'status' | 'audience'>) {
  return { id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status, audience: ticket.audience };
}
