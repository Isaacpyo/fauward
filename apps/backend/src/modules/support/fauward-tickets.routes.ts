import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SupportTicket, TicketCategory, TicketPriority } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { addTicketMessage, nextTicketNumber, tenantAuthorLabel, visibleTo } from '../../services/support-ticket.service.js';
import { recordAndPublishActivity } from '../../services/platform-activity.service.js';
import { notifyStaff } from '../../services/platform-notifier.service.js';

// L1 "Contact Fauward support" (D5, WP-2.3): a tenant's PLATFORM tickets. Any tenant staff member can open and answer
// them; the thread never includes STAFF_INTERNAL notes, and Fauward replies read as "Fauward Support".

const TENANT_STAFF = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_FINANCE', 'TENANT_STAFF'] as const;
const CATEGORIES = ['DELIVERY_ISSUE', 'PAYMENT_ISSUE', 'DAMAGED_GOODS', 'WRONG_ADDRESS', 'TRACKING_ISSUE', 'RETURN_REQUEST', 'BILLING_QUERY', 'OTHER'] as const satisfies readonly TicketCategory[];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const satisfies readonly TicketPriority[];

const createBody = z.object({
  subject: z.string().trim().min(3, 'Add a subject.').max(200),
  category: z.enum(CATEGORIES).default('OTHER'),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  body: z.string().trim().min(10, 'Describe the problem (at least 10 characters).').max(10_000),
  shipmentId: z.string().min(1).optional()
});
const replyBody = z.object({ body: z.string().trim().min(1, 'Write a reply.').max(10_000) });

function tenantId(request: FastifyRequest, reply: FastifyReply) {
  const id = request.tenant?.id;
  if (!id) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return id;
}

function validation(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: 'VALIDATION', message: error.issues.map((issue) => issue.message).join(' ') });
}

function summary(ticket: SupportTicket) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    lastMessageAt: ticket.lastMessageAt?.toISOString() ?? null,
    lastMessageAuthorType: ticket.lastMessageAuthorType,
    awaitingYou: ticket.lastMessageAuthorType === 'STAFF' && ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'].includes(ticket.status),
    linkedTicketId: ticket.linkedTicketId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null
  };
}

export async function registerFauwardTicketRoutes(app: FastifyInstance) {
  const pre = { preHandler: [authenticate, requireRole([...TENANT_STAFF])] };

  app.get('/api/v1/tenants/me/fauward-tickets', pre, async (request, reply) => {
    const id = tenantId(request, reply);
    if (!id) return;
    const tickets = await app.prisma.supportTicket.findMany({
      where: { tenantId: id, audience: 'PLATFORM' },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100
    });
    return reply.send({ tickets: tickets.map(summary) });
  });

  app.post('/api/v1/tenants/me/fauward-tickets', pre, async (request, reply) => {
    const id = tenantId(request, reply);
    const authorId = request.user?.sub;
    if (!id) return;
    if (!authorId) return reply.status(401).send({ error: 'Unauthorized' });
    const parsed = createBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    if (parsed.data.shipmentId) {
      const shipment = await app.prisma.shipment.findFirst({ where: { id: parsed.data.shipmentId, tenantId: id }, select: { id: true } });
      if (!shipment) return reply.status(400).send({ error: 'Shipment not found in this workspace' });
    }

    const now = new Date();
    const ticketNumber = await nextTicketNumber(app.prisma, id, 'PLATFORM', now);
    const ticket = await app.prisma.supportTicket.create({
      data: {
        tenantId: id,
        ticketNumber,
        audience: 'PLATFORM',
        customerId: authorId,
        shipmentId: parsed.data.shipmentId,
        subject: parsed.data.subject,
        category: parsed.data.category,
        priority: parsed.data.priority,
        lastMessageAt: now,
        lastMessageAuthorType: 'TENANT_USER',
        messages: { create: { tenantId: id, authorId, authorType: 'TENANT_USER', visibility: 'PUBLIC', body: parsed.data.body, createdAt: now } }
      }
    });

    const tenantName = request.tenant?.name ?? request.tenant?.slug ?? id;
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      {
        service: 'customer.support',
        type: 'ticket.created',
        tenantId: id,
        actorType: 'TENANT_USER',
        actorId: authorId,
        actorLabel: request.user?.email ?? 'Tenant user',
        subjectType: 'support_ticket',
        subjectId: ticket.id,
        summary: `${tenantName}: ${ticket.subject}`,
        severity: parsed.data.priority === 'URGENT' ? 'ATTENTION' : 'INFO',
        consoleLink: `/customer/support/tickets/${ticket.id}`,
        dedupeKey: `ticket.created:${ticket.id}`,
        metadata: { ticketNumber: ticket.ticketNumber, priority: ticket.priority, category: ticket.category }
      }
    );
    await notifyStaff(app, {
      permission: 'customer.support.write',
      event: 'ticket.created',
      title: `New ticket from ${tenantName}`,
      body: ticket.subject,
      link: `/customer/support/tickets/${ticket.id}`,
      severity: parsed.data.priority === 'URGENT' ? 'ATTENTION' : 'INFO',
      tenantId: id
    });
    return reply.status(201).send({ ticket: summary(ticket) });
  });

  app.get('/api/v1/tenants/me/fauward-tickets/:ticketId', pre, async (request, reply) => {
    const id = tenantId(request, reply);
    if (!id) return;
    const { ticketId } = request.params as { ticketId: string };
    const ticket = await app.prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId: id, audience: 'PLATFORM' },
      include: {
        linkedTicket: { select: { id: true, ticketNumber: true, subject: true } },
        messages: {
          // Tenant staff never receive STAFF_INTERNAL (S11, ACC-SUP-3).
          where: { visibility: { in: visibleTo('TENANT_STAFF', 'PLATFORM') } },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, email: true, firstName: true, lastName: true } } }
        }
      }
    });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    return reply.send({
      ticket: { ...summary(ticket), linkedTicket: ticket.linkedTicket },
      messages: ticket.messages.map((message) => ({
        id: message.id,
        authorType: message.authorType,
        authorLabel: tenantAuthorLabel(message, message.author),
        visibility: message.visibility,
        body: message.body,
        createdAt: message.createdAt.toISOString()
      }))
    });
  });

  app.post('/api/v1/tenants/me/fauward-tickets/:ticketId/messages', pre, async (request, reply) => {
    const id = tenantId(request, reply);
    const authorId = request.user?.sub;
    if (!id) return;
    if (!authorId) return reply.status(401).send({ error: 'Unauthorized' });
    const parsed = replyBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { ticketId } = request.params as { ticketId: string };
    const ticket = await app.prisma.supportTicket.findFirst({ where: { id: ticketId, tenantId: id, audience: 'PLATFORM' } });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    if (ticket.status === 'CLOSED') return reply.status(409).send({ error: 'TICKET_CLOSED', message: 'This ticket is closed. Open a new one.' });

    const { message } = await addTicketMessage(app.prisma, ticket, { authorType: 'TENANT_USER', authorId, visibility: 'PUBLIC', body: parsed.data.body });
    // A reply to a resolved ticket reopens it.
    if (ticket.status === 'RESOLVED' || ticket.status === 'WAITING_CUSTOMER') {
      await app.prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN', resolvedAt: null } });
    }

    const tenantName = request.tenant?.name ?? request.tenant?.slug ?? id;
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      {
        service: 'customer.support',
        type: 'ticket.replied.tenant',
        tenantId: id,
        actorType: 'TENANT_USER',
        actorId: authorId,
        actorLabel: request.user?.email ?? 'Tenant user',
        subjectType: 'support_ticket',
        subjectId: ticket.id,
        summary: `${tenantName} replied on ${ticket.ticketNumber}`,
        consoleLink: `/customer/support/tickets/${ticket.id}`,
        dedupeKey: `ticket.replied.tenant:${message.id}`
      }
    );
    const notifyInput = {
      event: 'ticket.replied.tenant',
      title: `${tenantName} replied on ${ticket.ticketNumber}`,
      body: parsed.data.body.slice(0, 200),
      link: `/customer/support/tickets/${ticket.id}`,
      tenantId: id
    };
    await notifyStaff(app, ticket.assignedPlatformUserId ? { ...notifyInput, platformUserIds: [ticket.assignedPlatformUserId] } : { ...notifyInput, permission: 'customer.support.write' });
    return reply.status(201).send({ id: message.id, createdAt: message.createdAt.toISOString() });
  });
}
