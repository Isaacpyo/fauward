import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, PaymentStatus } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import {
  SHIPMENT_EVENT_COD_COLLECTED,
  type CodCollectionPayload
} from '../shipments/shipment-events.const.js';
import { enqueueAgentEvent } from '../agent/agent.queue.js';

function dayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

export async function registerDriverRoutes(app: FastifyInstance) {
  app.get('/api/v1/driver/route', { preHandler: [authenticate] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    const userId = req.user?.sub;
    if (!tenantId) return;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { date } = req.query as { date?: string };
    const today = date ?? new Date().toISOString().split('T')[0];
    const { start, end } = dayRange(today);

    const driver = await app.prisma.driver.findFirst({ where: { tenantId, userId } });
    if (!driver) {
      return reply.send({ stops: [], pickups: 0, deliveries: 0 });
    }

    const route = await app.prisma.route.findFirst({
      where: { tenantId, driverId: driver.id, date: { gte: start, lt: end } },
      include: {
        stops: { orderBy: { stopOrder: 'asc' } }
      }
    });

    const stops = route?.stops ?? [];
    const pickups = stops.filter((stop) => stop.type === 'PICKUP').length;
    const deliveries = stops.filter((stop) => stop.type === 'DELIVERY').length;

    reply.send({
      id: route?.id ?? null,
      stops,
      pickups,
      deliveries
    });
  });

  app.patch(
    '/api/v1/driver/stops/:stopId/status',
    { preHandler: [authenticate, requireRole(['TENANT_DRIVER'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const userId = request.user?.sub;
      if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

      const { stopId } = request.params as { stopId: string };
      const payload = request.body as {
        status?: 'IN_PROGRESS' | 'COMPLETED';
        location?: { lat?: number; lng?: number };
      };

      if (!payload.status || !['IN_PROGRESS', 'COMPLETED'].includes(payload.status)) {
        return reply.status(400).send({ error: 'status must be IN_PROGRESS or COMPLETED' });
      }

      const driver = await app.prisma.driver.findFirst({ where: { tenantId, userId } });
      if (!driver) return reply.status(404).send({ error: 'Driver profile not found' });

      const stop = await app.prisma.routeStop.findFirst({
        where: {
          id: stopId,
          driverId: driver.id,
          route: { tenantId }
        }
      });
      if (!stop) return reply.status(404).send({ error: 'Stop not found' });

      const updatedStop = await app.prisma.routeStop.update({
        where: { id: stop.id },
        data: {
          arrivedAt: payload.status === 'IN_PROGRESS' ? new Date() : stop.arrivedAt,
          completedAt: payload.status === 'COMPLETED' ? new Date() : stop.completedAt
        }
      });

      await app.prisma.shipmentEvent.create({
        data: {
          tenantId,
          shipmentId: stop.shipmentId,
          status: payload.status === 'COMPLETED' ? 'DELIVERED' : 'OUT_FOR_DELIVERY',
          actorId: userId,
          actorType: 'TENANT_DRIVER',
          source: 'DRIVER_APP',
          location: (payload.location ?? undefined) as Prisma.InputJsonValue | undefined,
          notes: `Stop status updated: ${payload.status}`
        }
      });

      reply.send(updatedStop);
    }
  );

  app.post('/api/v1/driver/pod', { preHandler: [authenticate, requireRole(['TENANT_DRIVER'])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const userId = request.user?.sub;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const payload = request.body as {
      shipmentId?: string;
      photoBase64?: string;
      signatureBase64?: string;
      recipientName?: string;
      notes?: string;
      codCollection?: CodCollectionPayload;
    };

    if (!payload.shipmentId) {
      return reply.status(400).send({ error: 'shipmentId is required' });
    }

    const shipment = await app.prisma.shipment.findFirst({
      where: { id: payload.shipmentId, tenantId },
      include: { payment: true, invoice: true }
    });
    if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

    const assets: Array<{ type: string; fileUrl: string }> = [];
    if (payload.photoBase64) {
      assets.push({ type: 'PHOTO', fileUrl: payload.photoBase64.startsWith('data:') ? payload.photoBase64 : `data:image/jpeg;base64,${payload.photoBase64}` });
    }
    if (payload.signatureBase64) {
      assets.push({ type: 'SIGNATURE', fileUrl: payload.signatureBase64.startsWith('data:') ? payload.signatureBase64 : `data:image/png;base64,${payload.signatureBase64}` });
    }

    const cod = payload.codCollection;
    if (cod) {
      if (!cod.method || !['CASH', 'CARD_TERMINAL', 'BANK_TRANSFER'].includes(cod.method)) {
        return reply.status(400).send({ error: 'codCollection.method must be CASH, CARD_TERMINAL, or BANK_TRANSFER' });
      }
      if (!cod.amount || cod.amount <= 0) {
        return reply.status(400).send({ error: 'codCollection.amount must be greater than zero' });
      }
      if (!cod.currency) {
        return reply.status(400).send({ error: 'codCollection.currency is required' });
      }
    }

    await app.prisma.$transaction(async (tx) => {
      if (assets.length > 0) {
        await tx.podAsset.createMany({
          data: assets.map((asset) => ({
            tenantId,
            shipmentId: shipment.id,
            type: asset.type,
            fileUrl: asset.fileUrl,
            capturedBy: userId
          }))
        });
      }

      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: 'DELIVERED',
          actualDelivery: new Date(),
          notes: [shipment.notes, payload.recipientName ? `Recipient: ${payload.recipientName}` : null, payload.notes]
            .filter(Boolean)
            .join('\n')
        }
      });

      const deliveredEvent = await tx.shipmentEvent.create({
        data: {
          tenantId,
          shipmentId: shipment.id,
          status: 'DELIVERED',
          actorId: userId,
          actorType: 'TENANT_DRIVER',
          source: 'DRIVER_APP',
          notes: payload.notes ?? 'POD submitted'
        }
      });

      if (cod) {
        const codEvent = await tx.shipmentEvent.create({
          data: {
            tenantId,
            shipmentId: shipment.id,
            status: SHIPMENT_EVENT_COD_COLLECTED,
            actorId: userId,
            actorType: 'TENANT_DRIVER',
            source: 'DRIVER_APP',
            notes: JSON.stringify({ amount: cod.amount, currency: cod.currency, method: cod.method, collectedBy: cod.collectedBy ?? userId })
          }
        });

        let paymentId = shipment.payment?.id;
        if (paymentId) {
          await tx.payment.update({
            where: { id: paymentId },
            data: {
              status: PaymentStatus.COMPLETED,
              amount: cod.amount,
              currency: cod.currency.toUpperCase(),
              method: 'CASH',
              gatewayRef: `cod:${codEvent.id}`
            }
          });
        } else {
          const newPayment = await tx.payment.create({
            data: {
              tenantId,
              shipmentId: shipment.id,
              customerId: shipment.customerId,
              amount: cod.amount,
              currency: cod.currency.toUpperCase(),
              method: 'CASH',
              status: PaymentStatus.COMPLETED,
              gatewayRef: `cod:${codEvent.id}`,
              invoiceId: shipment.invoice?.id ?? null
            }
          });
          paymentId = newPayment.id;
        }

        if (shipment.invoice?.id) {
          const paidAggregate = await tx.payment.aggregate({
            where: { tenantId, invoiceId: shipment.invoice.id, status: PaymentStatus.COMPLETED },
            _sum: { amount: true }
          });
          const paidAmount = Number(paidAggregate._sum.amount ?? 0);
          const invoiceTotal = Number(shipment.invoice.total ?? 0);
          const nextStatus = paidAmount >= invoiceTotal ? 'PAID' : 'PARTIALLY_PAID';
          await tx.invoice.update({
            where: { id: shipment.invoice.id },
            data: {
              status: nextStatus,
              paidAt: nextStatus === 'PAID' ? new Date() : shipment.invoice.paidAt
            }
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId,
            actorId: userId,
            action: 'COD_COLLECTED',
            resourceType: 'PAYMENT',
            resourceId: paymentId,
            metadata: {
              shipmentId: shipment.id,
              amount: cod.amount,
              currency: cod.currency.toUpperCase(),
              method: cod.method,
              shipmentEventId: codEvent.id,
              deliveredEventId: deliveredEvent.id
            } as Prisma.InputJsonValue
          }
        });
      }
    });

    reply.send({ success: true });
  });

  app.patch('/api/v1/driver/shipments/:id/failed', { preHandler: [authenticate, requireRole(['TENANT_DRIVER'])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const userId = request.user?.sub;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const payload = request.body as { reason?: string; notes?: string; attemptedAt?: string };

    if (!payload.reason) return reply.status(400).send({ error: 'reason is required' });

    const shipment = await app.prisma.shipment.findFirst({ where: { id, tenantId } });
    if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

    const attemptedAt = payload.attemptedAt ? new Date(payload.attemptedAt) : new Date();

    const event = await app.prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: 'FAILED_DELIVERY',
          notes: [shipment.notes, `Failed reason: ${payload.reason}`, payload.notes].filter(Boolean).join('\n')
        }
      });

      const shipmentEvent = await tx.shipmentEvent.create({
        data: {
          tenantId,
          shipmentId: shipment.id,
          status: 'FAILED_DELIVERY',
          actorId: userId,
          actorType: 'TENANT_DRIVER',
          source: 'DRIVER_APP',
          notes: [payload.reason, payload.notes].filter(Boolean).join(' | '),
          timestamp: attemptedAt
        }
      });

      await tx.notificationLog.create({
        data: {
          tenantId,
          userId: shipment.customerId ?? undefined,
          channel: 'EMAIL',
          event: 'failed_delivery',
          status: 'QUEUED'
        }
      });

      return shipmentEvent;
    });

    void enqueueAgentEvent(app, {
      eventId: `failed-delivery-${shipment.id}-${event.id}`,
      type: 'failed_delivery',
      tenantId,
      shipmentId: shipment.id,
      payload: {
        newStatus: 'FAILED_DELIVERY',
        previousStatus: shipment.status,
        reason: payload.reason,
        source: 'DRIVER_APP'
      }
    });

    reply.send({ success: true });
  });

  app.get('/api/v1/driver/history', { preHandler: [authenticate, requireRole(['TENANT_DRIVER'])] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const userId = request.user?.sub;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const driver = await app.prisma.driver.findFirst({ where: { tenantId, userId } });
    if (!driver) return reply.send({ data: [] });

    const rows = await app.prisma.routeStop.findMany({
      where: {
        driverId: driver.id,
        completedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        },
        route: { tenantId }
      },
      include: {
        route: true
      },
      orderBy: { completedAt: 'desc' }
    });

    reply.send({
      data: rows.map((row) => ({
        id: row.id,
        shipmentId: row.shipmentId,
        completedAt: row.completedAt,
        routeId: row.routeId,
        stopOrder: row.stopOrder,
        type: row.type
      }))
    });
  });

  app.get(
    '/api/v1/driver/locations',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const drivers = await app.prisma.driver.findMany({
        where: { tenantId },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          vehicle: true,
          shipments: {
            where: { status: { in: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'] } },
            select: { id: true }
          }
        }
      });

      const data = drivers.map((driver) => ({
        driverId: driver.id,
        driverName:
          [driver.user.firstName, driver.user.lastName].filter(Boolean).join(' ') || driver.user.email,
        lat: Number(driver.currentLat ?? 0),
        lng: Number(driver.currentLng ?? 0),
        lastUpdated: driver.lastLocationAt,
        activeShipments: driver.shipments.length,
        vehicleType: driver.vehicle?.type ?? null
      }));

      reply.send(data);
    }
  );

  app.patch('/api/v1/driver/location', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    if (!tenantId) return;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { lat, lng, accuracy } = request.body as { lat?: number; lng?: number; accuracy?: number };
    if (lat === undefined || lng === undefined) {
      return reply.status(400).send({ error: 'lat and lng are required' });
    }

    const driver = await app.prisma.driver.findFirst({ where: { tenantId, userId } });
    if (!driver) return reply.status(404).send({ error: 'Driver profile not found' });

    const updated = await app.prisma.driver.update({
      where: { id: driver.id },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastLocationAt: new Date()
      }
    });

    await app.redis.set(
      `driver:${driver.id}:location`,
      JSON.stringify({
        driverId: driver.id,
        lat,
        lng,
        accuracy: accuracy ?? null,
        updatedAt: new Date().toISOString()
      }),
      'EX',
      300
    );

    const activeStop = await app.prisma.routeStop.findFirst({
      where: { driverId: driver.id, completedAt: null },
      orderBy: { stopOrder: 'asc' }
    });
    if (activeStop) {
      await app.prisma.shipmentEvent.create({
        data: {
          tenantId,
          shipmentId: activeStop.shipmentId,
          status: 'IN_TRANSIT',
          source: 'GPS',
          actorId: driver.userId,
          actorType: 'TENANT_DRIVER',
          location: { lat, lng, accuracy }
        }
      });
    }

    reply.send({ success: true, driverId: updated.id, lastUpdated: updated.lastLocationAt });
  });
}
