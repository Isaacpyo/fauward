import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ReturnStatus } from '@prisma/client';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { createInAppNotifications } from '../notifications/notifications.routes.js';

const ALLOWED_RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['LABEL_ISSUED'],
  LABEL_ISSUED: ['PICKED_UP'],
  PICKED_UP: ['IN_HUB'],
  IN_HUB: ['RECEIVED'],
  RECEIVED: ['REFUNDED', 'RESOLVED'],
  REFUNDED: ['RESOLVED'],
  RESOLVED: [],
  REJECTED: []
};

const RETURN_STAFF_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'] as const;
const RETURN_PHYSICAL_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF', 'TENANT_DRIVER'] as const;

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

async function getOpsUserIds(app: FastifyInstance, tenantId: string) {
  const users = await app.prisma.user.findMany({
    where: { tenantId, role: { in: ['TENANT_ADMIN', 'TENANT_MANAGER'] } },
    select: { id: true }
  });
  return users.map((user) => user.id);
}

export async function registerReturnsRoutes(app: FastifyInstance) {
  app.get('/api/v1/returns', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const { status, page = '1', limit = '20' } = request.query as {
      status?: ReturnStatus;
      page?: string;
      limit?: string;
    };
    const take = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const where: { tenantId: string; status?: ReturnStatus } = { tenantId };
    if (status) where.status = status;

    const [returns, total] = await Promise.all([
      app.prisma.returnRequest.findMany({
        where,
        include: {
          shipment: { select: { trackingNumber: true, status: true } },
          customer: { select: { email: true, firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      app.prisma.returnRequest.count({ where })
    ]);

    reply.send({ data: returns, total, page: Math.max(1, Number(page) || 1), pageSize: take });
  });

  app.post('/api/v1/returns', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    if (!tenantId) return;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { shipmentId, reason, notes } = request.body as {
      shipmentId?: string;
      reason?: string;
      notes?: string;
    };
    if (!shipmentId || !reason) {
      return reply.status(400).send({ error: 'shipmentId and reason are required' });
    }

    const shipment = await app.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      select: { id: true, status: true, customerId: true, organisationId: true, trackingNumber: true }
    });
    if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });
    if (shipment.status !== 'DELIVERED') {
      return reply.status(400).send({ error: 'Only delivered shipments can be returned' });
    }

    const role = request.user?.role;
    const isCustomerRole = role === 'CUSTOMER_ADMIN' || role === 'CUSTOMER_USER';
    if (isCustomerRole && shipment.customerId && shipment.customerId !== userId) {
      return reply.status(403).send({ error: 'You can only request returns for your own shipment' });
    }

    const returnRequest = await app.prisma.returnRequest.create({
      data: {
        tenantId,
        shipmentId: shipment.id,
        customerId: shipment.customerId ?? userId,
        organisationId: shipment.organisationId,
        reason: reason as any,
        notes,
        status: 'REQUESTED'
      }
    });

    const opsUserIds = await getOpsUserIds(app, tenantId);
    await createInAppNotifications(app, {
      tenantId,
      userIds: opsUserIds,
      type: 'return_requested',
      title: `Return requested for ${shipment.trackingNumber}`,
      body: `Reason: ${reason}`,
      link: `/returns/${returnRequest.id}`
    });

    reply.status(201).send(returnRequest);
  });

  app.get('/api/v1/returns/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const { id } = request.params as { id: string };
    const returnRequest = await app.prisma.returnRequest.findFirst({
      where: { id, tenantId },
      include: {
        shipment: true,
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        organisation: true,
        handler: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
    if (!returnRequest) return reply.status(404).send({ error: 'Return request not found' });

    reply.send(returnRequest);
  });

  app.patch(
    '/api/v1/returns/:id/approve',
    { preHandler: [authenticate, requireRole([...RETURN_STAFF_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      const actorId = request.user?.sub;
      if (!tenantId) return;
      if (!actorId) return reply.status(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const existing = await app.prisma.returnRequest.findFirst({
        where: { id, tenantId },
        include: { shipment: { select: { trackingNumber: true } } }
      });
      if (!existing) return reply.status(404).send({ error: 'Return request not found' });
      if (existing.status !== 'REQUESTED') return reply.status(400).send({ error: 'Return is not in REQUESTED state' });

      const returnLabel = `/api/v1/label/${existing.shipment.trackingNumber}?type=return`;
      const updated = await app.prisma.returnRequest.update({
        where: { id: existing.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          handledBy: actorId,
          returnLabel
        }
      });

      await createInAppNotifications(app, {
        tenantId,
        userIds: [existing.customerId],
        type: 'return_approved',
        title: 'Return approved',
        body: 'Your return request has been approved and label is ready.',
        link: `/returns/${existing.id}`
      });

      reply.send(updated);
    }
  );

  app.patch(
    '/api/v1/returns/:id/reject',
    { preHandler: [authenticate, requireRole([...RETURN_STAFF_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      const actorId = request.user?.sub;
      if (!tenantId) return;
      if (!actorId) return reply.status(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };
      const existing = await app.prisma.returnRequest.findFirst({
        where: { id, tenantId }
      });
      if (!existing) return reply.status(404).send({ error: 'Return request not found' });
      if (existing.status !== 'REQUESTED') return reply.status(400).send({ error: 'Return is not in REQUESTED state' });

      const updated = await app.prisma.returnRequest.update({
        where: { id: existing.id },
        data: {
          status: 'REJECTED',
          handledBy: actorId,
          notes: [existing.notes, reason ? `Rejected: ${reason}` : 'Rejected'].filter(Boolean).join('\n')
        }
      });

      await createInAppNotifications(app, {
        tenantId,
        userIds: [existing.customerId],
        type: 'return_rejected',
        title: 'Return rejected',
        body: reason ?? 'Your return request was rejected.',
        link: `/returns/${existing.id}`
      });

      reply.send(updated);
    }
  );

  app.patch(
    '/api/v1/returns/:id/status',
    { preHandler: [authenticate, requireRole([...RETURN_PHYSICAL_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const { id } = request.params as { id: string };
      const { status } = request.body as { status?: ReturnStatus };
      if (!status) return reply.status(400).send({ error: 'status is required' });

      const existing = await app.prisma.returnRequest.findFirst({ where: { id, tenantId } });
      if (!existing) return reply.status(404).send({ error: 'Return request not found' });

      const allowed = ALLOWED_RETURN_TRANSITIONS[existing.status];
      if (!allowed.includes(status)) {
        return reply.status(400).send({ error: `Invalid transition from ${existing.status} to ${status}` });
      }

      const updateData: Record<string, unknown> = { status };
      if (status === 'RECEIVED') updateData.receivedAt = new Date();
      if (status === 'RESOLVED') updateData.resolvedAt = new Date();

      const updated = await app.prisma.returnRequest.update({
        where: { id: existing.id },
        data: updateData
      });

      if (status === 'RECEIVED') {
        await createInAppNotifications(app, {
          tenantId,
          userIds: [existing.customerId],
          type: 'return_received',
          title: 'Returned item received',
          body: 'Your returned shipment has been received at the hub.',
          link: `/returns/${existing.id}`
        });
      }

      reply.send(updated);
    }
  );

  app.post(
    '/api/v1/returns/:id/refund',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_FINANCE'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const { id } = request.params as { id: string };
      const existing = await app.prisma.returnRequest.findFirst({ where: { id, tenantId } });
      if (!existing) return reply.status(404).send({ error: 'Return request not found' });

      const updated = await app.prisma.returnRequest.update({
        where: { id: existing.id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date()
        }
      });

      await createInAppNotifications(app, {
        tenantId,
        userIds: [existing.customerId],
        type: 'return_refunded',
        title: 'Refund processed',
        body: 'Your refund has been processed successfully.',
        link: `/returns/${existing.id}`
      });

      reply.send(updated);
    }
  );
}

