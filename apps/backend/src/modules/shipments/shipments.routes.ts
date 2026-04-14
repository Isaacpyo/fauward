import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, ShipmentStatus } from '@prisma/client';

import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { resolveIdempotency, storeIdempotencyResult } from '../../shared/middleware/idempotency.js';
import { calculateShipmentPrice } from '../../shared/utils/pricing.js';
import { generateTrackingNumber } from '../../shared/utils/trackingNumber.js';
import { emitTrackingStatusUpdate } from '../tracking/tracking.websocket.js';
import { notificationQueue, webhookQueue } from '../../queues/queues.js';
import { createInAppNotifications } from '../notifications/notifications.routes.js';

export const ALLOWED_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'EXCEPTION', 'FAILED_DELIVERY'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'EXCEPTION', 'FAILED_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY', 'EXCEPTION'],
  DELIVERED: ['RETURNED'],
  FAILED_DELIVERY: ['OUT_FOR_DELIVERY', 'RETURNED', 'EXCEPTION'],
  RETURNED: [],
  CANCELLED: [],
  EXCEPTION: ['PROCESSING', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY']
};

const STATUS_TEMPLATE_MAP: Partial<Record<ShipmentStatus, string>> = {
  PICKED_UP: 'shipment_picked_up',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  FAILED_DELIVERY: 'failed_delivery',
  EXCEPTION: 'shipment_exception'
};

function monthKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function asAddressString(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  return Object.values(address as Record<string, unknown>)
    .filter(Boolean)
    .join(', ');
}

async function fireShipmentWebhook(
  app: FastifyInstance,
  tenantId: string,
  shipmentId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  const endpoints = await app.prisma.webhookEndpoint.findMany({
    where: { tenantId, isActive: true, events: { has: eventType } },
    select: { id: true }
  });

  await Promise.all(
    endpoints.map(async (endpoint) => {
      await webhookQueue.add(eventType, {
        endpointId: endpoint.id,
        eventType,
        payload,
        tenantId,
        shipmentId
      });
    })
  );
}

async function enqueueShipmentNotifications(
  app: FastifyInstance,
  args: {
    tenantId: string;
    shipmentId: string;
    status: ShipmentStatus;
    trackingNumber: string;
    plan?: string;
  }
) {
  const template = STATUS_TEMPLATE_MAP[args.status];
  if (!template) return;

  const [shipment, admins] = await Promise.all([
    app.prisma.shipment.findFirst({
      where: { id: args.shipmentId, tenantId: args.tenantId },
      select: { customerId: true }
    }),
    app.prisma.user.findMany({
      where: { tenantId: args.tenantId, role: { in: ['TENANT_ADMIN', 'TENANT_MANAGER'] }, isActive: true },
      select: { id: true, email: true }
    })
  ]);

  if (!shipment) return;
  const customer = shipment.customerId
    ? await app.prisma.user.findFirst({
        where: { id: shipment.customerId, tenantId: args.tenantId },
        select: { id: true, email: true, phone: true }
      })
    : null;

  if (customer?.email) {
    await notificationQueue.add('email', {
      tenantId: args.tenantId,
      userId: customer.id,
      channel: 'EMAIL',
      event: template,
      to: customer.email,
      template,
      data: {
        trackingNumber: args.trackingNumber,
        status: args.status
      }
    });
  }

  for (const admin of admins) {
    await notificationQueue.add('email', {
      tenantId: args.tenantId,
      userId: admin.id,
      channel: 'EMAIL',
      event: template,
      to: admin.email,
      template,
      data: {
        trackingNumber: args.trackingNumber,
        status: args.status
      }
    });
  }

  const supportsSms = args.plan === 'PRO' || args.plan === 'ENTERPRISE';
  if (supportsSms && customer?.phone) {
    await notificationQueue.add('sms', {
      tenantId: args.tenantId,
      userId: customer.id,
      channel: 'SMS',
      event: `${template}_sms`,
      to: customer.phone,
      message: `Shipment ${args.trackingNumber} is now ${args.status.replaceAll('_', ' ')}.`
    });
  }

  await createInAppNotifications(app, {
    tenantId: args.tenantId,
    userIds: admins.map((admin) => admin.id),
    type: `shipment_${args.status.toLowerCase()}`,
    title: `Shipment ${args.trackingNumber} ${args.status.replaceAll('_', ' ').toLowerCase()}`,
    body: `Status updated to ${args.status}`,
    link: `/shipments/${args.shipmentId}`
  });
}

export async function registerShipmentRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/shipments',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const query = request.query as {
        page?: string;
        limit?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        driverId?: string;
        customerId?: string;
        search?: string;
      };

      const page = Math.max(1, Number(query.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
      const skip = (page - 1) * limit;

      const statuses = typeof query.status === 'string'
        ? query.status.split(',').map((value) => value.trim()).filter(Boolean)
        : [];

      const where: Prisma.ShipmentWhereInput = {
        tenantId,
        status: statuses.length > 0 ? { in: statuses as ShipmentStatus[] } : undefined,
        assignedDriverId: query.driverId || undefined,
        customerId: query.customerId || undefined,
        createdAt:
          query.dateFrom || query.dateTo
            ? {
                gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
                lte: query.dateTo ? new Date(query.dateTo) : undefined
              }
            : undefined,
        OR: query.search
          ? [
              { trackingNumber: { contains: query.search, mode: 'insensitive' } },
              { notes: { contains: query.search, mode: 'insensitive' } }
            ]
          : undefined
      };

      const [rows, total] = await Promise.all([
        app.prisma.shipment.findMany({
          where,
          include: {
            driver: { include: { user: true } },
            organisation: true
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        app.prisma.shipment.count({ where })
      ]);

      reply.send({
        data: rows,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    }
  );

  app.post(
    '/api/v1/shipments',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const idempotency = await resolveIdempotency(request, reply);
      if (idempotency.type === 'duplicate') {
        return reply.status(idempotency.statusCode).send(idempotency.response);
      }
      if (idempotency.type === 'processing') {
        return reply.status(409).send({ error: 'Duplicate request in flight' });
      }

      const payload = request.body as {
        trackingNumber?: string;
        customerId?: string;
        organisationId?: string;
        originAddress?: Record<string, unknown>;
        destinationAddress?: Record<string, unknown>;
        originZoneId?: string;
        destZoneId?: string;
        serviceTier?: string;
        estimatedDelivery?: string;
        notes?: string;
        specialInstructions?: string;
        insuranceTier?: string;
        promoCode?: string;
        items?: Array<{
          description?: string;
          quantity?: number;
          weightKg?: number;
          lengthCm?: number;
          widthCm?: number;
          heightCm?: number;
          declaredValue?: number;
          hsCode?: string;
          isDangerous?: boolean;
        }>;
      };

      if (!payload.originAddress || !payload.destinationAddress) {
        return reply.status(400).send({ error: 'originAddress and destinationAddress are required' });
      }

      const tenantSlug = request.tenant?.slug ?? 'TENANT';
      const trackingNumber =
        payload.trackingNumber?.toUpperCase() ??
        (await generateTrackingNumber(app.prisma, tenantSlug));

      const items = payload.items ?? [];
      const pricing = await calculateShipmentPrice(app.prisma, {
        tenantId,
        originZoneId: payload.originZoneId,
        destZoneId: payload.destZoneId,
        serviceTier: payload.serviceTier ?? 'STANDARD',
        items,
        promoCode: payload.promoCode,
        insuranceTier: payload.insuranceTier,
        customerId: payload.customerId
      });

      const shipment = await app.prisma.$transaction(async (tx) => {
        const created = await tx.shipment.create({
          data: {
            tenantId,
            trackingNumber,
            customerId: payload.customerId,
            organisationId: payload.organisationId,
            originAddress: payload.originAddress as Prisma.InputJsonValue,
            destinationAddress: payload.destinationAddress as Prisma.InputJsonValue,
            serviceTier: payload.serviceTier ?? 'STANDARD',
            estimatedDelivery: payload.estimatedDelivery ? new Date(payload.estimatedDelivery) : undefined,
            notes: payload.notes,
            specialInstructions: payload.specialInstructions,
            price: pricing.total,
            currency: pricing.currency,
            weightKg: items.reduce((sum, item) => sum + Number(item.weightKg ?? 0), 0),
            insuranceValue: items.reduce((sum, item) => sum + Number(item.declaredValue ?? 0), 0)
          }
        });

        if (items.length > 0) {
          await tx.shipmentItem.createMany({
            data: items.map((item) => ({
              tenantId,
              shipmentId: created.id,
              description: item.description,
              quantity: item.quantity ?? 1,
              weightKg: item.weightKg,
              lengthCm: item.lengthCm,
              widthCm: item.widthCm,
              heightCm: item.heightCm,
              declaredValue: item.declaredValue,
              hsCode: item.hsCode,
              isDangerous: item.isDangerous ?? false
            }))
          });
        }

        await tx.shipmentEvent.create({
          data: {
            tenantId,
            shipmentId: created.id,
            status: 'PENDING',
            actorId: request.user?.sub,
            actorType: request.user?.role ?? 'USER',
            notes: 'Shipment created'
          }
        });

        await tx.usageRecord.upsert({
          where: { tenantId_month: { tenantId, month: monthKey() } },
          create: { tenantId, month: monthKey(), shipments: 1 },
          update: { shipments: { increment: 1 } }
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'shipment',
            aggregateId: created.id,
            eventType: 'shipment.created',
            payload: {
              tenantId,
              shipmentId: created.id,
              trackingNumber: created.trackingNumber
            }
          }
        });

        return created;
      });

      const admins = await app.prisma.user.findMany({
        where: { tenantId, role: { in: ['TENANT_ADMIN', 'TENANT_MANAGER'] }, isActive: true },
        select: { id: true, email: true }
      });
      if (payload.customerId) {
        const customer = await app.prisma.user.findFirst({
          where: { id: payload.customerId, tenantId },
          select: { id: true, email: true }
        });
        if (customer?.email) {
          await notificationQueue.add('email', {
            tenantId,
            userId: customer.id,
            channel: 'EMAIL',
            event: 'booking_confirmed',
            to: customer.email,
            template: 'booking_confirmed',
            data: { trackingNumber: shipment.trackingNumber }
          });
        }
      }
      for (const admin of admins) {
        await notificationQueue.add('email', {
          tenantId,
          userId: admin.id,
          channel: 'EMAIL',
          event: 'ops_new_shipment',
          to: admin.email,
          template: 'ops_new_shipment',
          data: { trackingNumber: shipment.trackingNumber }
        });
      }

      const response = {
        ...shipment,
        pricingBreakdown: pricing.breakdown,
        chargeableWeightKg: pricing.chargeableWeightKg
      };

      if (idempotency.type === 'new') {
        await storeIdempotencyResult(request, idempotency.key, 201, response);
      }

      reply.status(201).send(response);
    }
  );

  app.get(
    '/api/v1/shipments/:id',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const { id } = request.params as { id: string };

      const shipment = await app.prisma.shipment.findFirst({
        where: { id, tenantId },
        include: {
          items: true,
          events: { orderBy: { timestamp: 'desc' } },
          podAssets: true,
          driver: { include: { user: true } },
          organisation: true,
          invoice: true,
          documents: true
        }
      });

      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });
      reply.send(shipment);
    }
  );

  app.patch(
    '/api/v1/shipments/:id/status',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const { id } = request.params as { id: string };
      const { status, notes, location, failedReason } = request.body as {
        status?: ShipmentStatus;
        notes?: string;
        location?: Record<string, unknown>;
        failedReason?: string;
      };

      if (!status) return reply.status(400).send({ error: 'status is required' });

      const shipment = await app.prisma.shipment.findFirst({
        where: { id, tenantId },
        include: { podAssets: true }
      });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      const allowed = ALLOWED_TRANSITIONS[shipment.status] ?? [];
      if (!allowed.includes(status)) {
        return reply.status(400).send({ error: `Invalid transition from ${shipment.status} to ${status}` });
      }

      if (status === 'DELIVERED' && shipment.podAssets.length === 0) {
        return reply.status(400).send({ error: 'POD is required before marking shipment DELIVERED' });
      }

      if (status === 'FAILED_DELIVERY' && !failedReason?.trim()) {
        return reply.status(400).send({ error: 'failedReason is required for FAILED_DELIVERY' });
      }

      const eventNotes = [notes, failedReason ? `Failed reason: ${failedReason}` : null]
        .filter(Boolean)
        .join('\n');

      const updated = await app.prisma.$transaction(async (tx) => {
        const next = await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status,
            notes: eventNotes || shipment.notes,
            actualDelivery: status === 'DELIVERED' ? new Date() : shipment.actualDelivery
          }
        });

        const event = await tx.shipmentEvent.create({
          data: {
            tenantId,
            shipmentId: shipment.id,
            status,
            notes: eventNotes || undefined,
            actorId: request.user?.sub,
            actorType: request.user?.role ?? 'USER',
            location: (location ?? undefined) as Prisma.InputJsonValue | undefined
          }
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'shipment',
            aggregateId: shipment.id,
            eventType: 'shipment.status.updated',
            payload: {
              tenantId,
              shipmentId: shipment.id,
              trackingNumber: shipment.trackingNumber,
              status,
              notes: eventNotes || null,
              location: location ? (JSON.parse(JSON.stringify(location)) as Prisma.InputJsonValue) : null,
              timestamp: event.timestamp.toISOString()
            } as Prisma.InputJsonValue
          }
        });

        return { next, event };
      });

      emitTrackingStatusUpdate({
        tenantId,
        trackingNumber: shipment.trackingNumber,
        status,
        location,
        timestamp: updated.event.timestamp.toISOString()
      });

      await fireShipmentWebhook(app, tenantId, shipment.id, 'shipment.status.changed', {
        tenantId,
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        status,
        notes: eventNotes || null,
        location: location ?? null,
        timestamp: updated.event.timestamp.toISOString()
      });

      await enqueueShipmentNotifications(app, {
        tenantId,
        shipmentId: shipment.id,
        status,
        trackingNumber: shipment.trackingNumber,
        plan: request.tenant?.plan
      });

      reply.send(updated.next);
    }
  );

  app.patch(
    '/api/v1/shipments/:id/assign',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const { id } = request.params as { id: string };
      const { driverId } = request.body as { driverId?: string | null };

      const shipment = await app.prisma.shipment.findFirst({ where: { id, tenantId } });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      if (driverId) {
        const driver = await app.prisma.driver.findFirst({ where: { id: driverId, tenantId } });
        if (!driver) return reply.status(404).send({ error: 'Driver not found' });
      }

      const updated = await app.prisma.shipment.update({
        where: { id: shipment.id },
        data: { assignedDriverId: driverId ?? null }
      });
      reply.send(updated);
    }
  );

  app.patch(
    '/api/v1/shipments/:id/assign-driver',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { driverId } = request.body as { driverId?: string | null };
      request.params = { id };
      request.body = { driverId };
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const shipment = await app.prisma.shipment.findFirst({ where: { id, tenantId } });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      if (driverId) {
        const driver = await app.prisma.driver.findFirst({ where: { id: driverId, tenantId } });
        if (!driver) return reply.status(404).send({ error: 'Driver not found' });
      }

      const updated = await app.prisma.shipment.update({
        where: { id: shipment.id },
        data: { assignedDriverId: driverId ?? null }
      });
      reply.send(updated);
    }
  );

  app.delete(
    '/api/v1/shipments/:id',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const { id } = request.params as { id: string };

      const shipment = await app.prisma.shipment.findFirst({ where: { id, tenantId } });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      if (!['PENDING', 'PROCESSING'].includes(shipment.status)) {
        return reply.status(400).send({ error: 'Only PENDING or PROCESSING shipments can be cancelled' });
      }

      const updated = await app.prisma.$transaction(async (tx) => {
        const next = await tx.shipment.update({
          where: { id: shipment.id },
          data: { status: 'CANCELLED' }
        });

        await tx.shipmentEvent.create({
          data: {
            tenantId,
            shipmentId: shipment.id,
            status: 'CANCELLED',
            notes: 'Shipment cancelled',
            actorId: request.user?.sub,
            actorType: request.user?.role ?? 'USER'
          }
        });

        return next;
      });

      reply.send(updated);
    }
  );

  app.get(
    '/api/v1/shipments/:id/pod',
    { preHandler: [app.authenticate, requireTenantMatch] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const { id } = request.params as { id: string };

      const shipment = await app.prisma.shipment.findFirst({
        where: { id, tenantId },
        include: {
          podAssets: true,
          driver: { include: { user: true } }
        }
      });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      const capturedBy =
        [shipment.driver?.user.firstName, shipment.driver?.user.lastName].filter(Boolean).join(' ') ||
        shipment.driver?.user.email ||
        'Driver';

      reply.send({
        podAssets: shipment.podAssets,
        recipientName: shipment.organisationId ?? 'Recipient',
        deliveredAt: shipment.actualDelivery,
        capturedBy
      });
    }
  );

  app.get(
    '/api/v1/shipments/live-map',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const shipments = await app.prisma.shipment.findMany({
        where: { tenantId, status: { in: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'] } },
        include: {
          events: {
            orderBy: { timestamp: 'desc' },
            take: 1
          },
          driver: { include: { user: true } },
          organisation: true
        },
        take: 500
      });

      const data = shipments
        .map((shipment) => {
          const event = shipment.events[0];
          const location = (event?.location ?? {}) as Record<string, unknown>;
          const lat = Number(location.lat ?? location.latitude);
          const lng = Number(location.lng ?? location.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const driverName =
            [shipment.driver?.user.firstName, shipment.driver?.user.lastName].filter(Boolean).join(' ') ||
            shipment.driver?.user.email ||
            null;
          return {
            shipmentId: shipment.id,
            trackingNumber: shipment.trackingNumber,
            lat,
            lng,
            status: shipment.status,
            driverName,
            recipientName: shipment.organisation?.name ?? 'Recipient',
            estimatedDelivery: shipment.estimatedDelivery,
            origin: asAddressString(shipment.originAddress),
            destination: asAddressString(shipment.destinationAddress)
          };
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value));

      reply.send({ shipments: data });
    }
  );
}
