import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { createInAppNotifications } from '../notifications/notifications.routes.js';

const STAFF_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'] as const;

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

async function buildTicketNumber(app: FastifyInstance, tenantId: string) {
  const tenant = await app.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true }
  });
  const slug = (tenant?.slug ?? 'tenant').toUpperCase();
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const count = await app.prisma.supportTicket.count({
    where: {
      tenantId,
      createdAt: {
        gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      }
    }
  });
  return `${slug}-TKT-${yyyymm}-${String(count + 1).padStart(4, '0')}`;
}

export async function registerSupportRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/support/tickets',
    { preHandler: [authenticate, requireRole([...STAFF_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const {
        status,
        priority,
        category,
        assignedTo,
        search,
        page = '1',
        limit = '20'
      } = request.query as {
        status?: string;
        priority?: string;
        category?: string;
        assignedTo?: string;
        search?: string;
        page?: string;
        limit?: string;
      };

      const take = Math.max(1, Math.min(100, Number(limit) || 20));
      const skip = (Math.max(1, Number(page) || 1) - 1) * take;

      const where: any = { tenantId };
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (category) where.category = category;
      if (assignedTo) where.assignedTo = assignedTo;
      if (search) {
        where.OR = [
          { ticketNumber: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          { customer: { email: { contains: search, mode: 'insensitive' } } }
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
          orderBy: { createdAt: 'desc' },
          take,
          skip
        }),
        app.prisma.supportTicket.count({ where })
      ]);

      reply.send({ tickets, total, page: Math.max(1, Number(page) || 1), pageSize: take });
    }
  );

  app.post('/api/v1/support/tickets', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const authorId = request.user?.sub;
    if (!tenantId) return;
    if (!authorId) return reply.status(401).send({ error: 'Unauthorized' });

    const { subject, category = 'OTHER', priority = 'NORMAL', shipmentId, message, body } = request.body as {
      subject?: string;
      category?: string;
      priority?: string;
      shipmentId?: string;
      message?: string;
      body?: string;
    };
    const messageBody = message ?? body;
    if (!subject || !messageBody) {
      return reply.status(400).send({ error: 'subject and message are required' });
    }

    const ticketNumber = await buildTicketNumber(app, tenantId);
    const ticket = await app.prisma.supportTicket.create({
      data: {
        tenantId,
        ticketNumber,
        customerId: authorId,
        shipmentId,
        subject,
        category: category as any,
        priority: priority as any,
        messages: {
          create: {
            tenantId,
            authorId,
            body: messageBody,
            isInternal: false
          }
        }
      },
      include: { messages: true }
    });

    const adminUsers = await app.prisma.user.findMany({
      where: { tenantId, role: { in: ['TENANT_ADMIN', 'TENANT_MANAGER'] } },
      select: { id: true }
    });
    await createInAppNotifications(app, {
      tenantId,
      userIds: adminUsers.map((user) => user.id),
      type: 'ticket_opened',
      title: `New ticket ${ticket.ticketNumber}`,
      body: subject,
      link: `/support/${ticket.id}`
    });

    reply.status(201).send(ticket);
  });

  app.get('/api/v1/support/tickets/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    const role = request.user?.role;
    if (!tenantId) return;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const ticket = await app.prisma.supportTicket.findFirst({
      where: { id, tenantId },
      include: {
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        shipment: { select: { id: true, trackingNumber: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, email: true, firstName: true, lastName: true, role: true } }
          }
        }
      }
    });

    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    const isStaff = STAFF_ROLES.includes((role ?? '') as any) || role === 'TENANT_FINANCE';
    if (!isStaff && ticket.customerId && ticket.customerId !== userId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const messages = isStaff ? ticket.messages : ticket.messages.filter((message) => !message.isInternal);
    reply.send({ ...ticket, messages });
  });

  app.post('/api/v1/support/tickets/:id/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const authorId = request.user?.sub;
    const role = request.user?.role;
    if (!tenantId) return;
    if (!authorId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const { body, isInternal = false } = request.body as { body?: string; isInternal?: boolean };
    if (!body) return reply.status(400).send({ error: 'body is required' });

    const ticket = await app.prisma.supportTicket.findFirst({ where: { id, tenantId } });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    if (ticket.status === 'CLOSED') return reply.status(400).send({ error: 'Ticket is closed' });

    const isStaff = STAFF_ROLES.includes((role ?? '') as any);
    if (isInternal && !isStaff) return reply.status(403).send({ error: 'Only staff can add internal notes' });

    const message = await app.prisma.ticketMessage.create({
      data: { tenantId, ticketId: id, authorId, body, isInternal }
    });

    if (!isInternal) {
      const notifyUserIds = isStaff
        ? ticket.customerId
          ? [ticket.customerId]
          : []
        : [ticket.assignedTo].filter(Boolean) as string[];

      await createInAppNotifications(app, {
        tenantId,
        userIds: notifyUserIds,
        type: isStaff ? 'ticket_reply_from_staff' : 'ticket_reply_from_customer',
        title: `New reply on ${ticket.ticketNumber}`,
        body,
        link: `/support/${ticket.id}`
      });
    }

    reply.status(201).send(message);
  });

  app.patch(
    '/api/v1/support/tickets/:id',
    { preHandler: [authenticate, requireRole([...STAFF_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const { id } = request.params as { id: string };
      const { status, priority, assignedTo } = request.body as {
        status?: string;
        priority?: string;
        assignedTo?: string | null;
      };

      const ticket = await app.prisma.supportTicket.findFirst({ where: { id, tenantId } });
      if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });

      const updated = await app.prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: status as any,
          priority: priority as any,
          assignedTo: assignedTo ?? undefined
        }
      });

      reply.send(updated);
    }
  );

  app.post(
    '/api/v1/support/tickets/:id/resolve',
    { preHandler: [authenticate, requireRole([...STAFF_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const { id } = request.params as { id: string };
      const ticket = await app.prisma.supportTicket.findFirst({ where: { id, tenantId } });
      if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });

      const updated = await app.prisma.supportTicket.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date() }
      });

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

      reply.send(updated);
    }
  );

  app.post(
    '/api/v1/support/tickets/:id/close',
    { preHandler: [authenticate, requireRole([...STAFF_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const { id } = request.params as { id: string };
      const ticket = await app.prisma.supportTicket.findFirst({ where: { id, tenantId } });
      if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
      if (ticket.status !== 'RESOLVED') {
        return reply.status(400).send({ error: 'Ticket must be resolved before closing' });
      }

      const updated = await app.prisma.supportTicket.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date() }
      });
      reply.send(updated);
    }
  );
}
