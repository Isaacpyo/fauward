import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, ShipmentStatus } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';

const AGENT_ALLOWED_ROLES = ['TENANT_DRIVER', 'TENANT_STAFF', 'TENANT_MANAGER', 'TENANT_ADMIN'] as const;

const AGENT_STATUS_FLOW: ShipmentStatus[] = [
  'PENDING',
  'PROCESSING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED'
];

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

function asLocationLabel(location: unknown): string | null {
  if (!location || typeof location !== 'object') return null;

  const payload = location as Record<string, unknown>;
  const label = payload.label;
  if (typeof label === 'string' && label.trim().length > 0) {
    return label.trim();
  }

  const lat = Number(payload.lat ?? payload.latitude);
  const lng = Number(payload.lng ?? payload.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  return null;
}

function getNextStatus(status: ShipmentStatus): ShipmentStatus | null {
  const index = AGENT_STATUS_FLOW.indexOf(status);
  if (index === -1 || index >= AGENT_STATUS_FLOW.length - 1) {
    return null;
  }
  return AGENT_STATUS_FLOW[index + 1];
}

function compactText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export async function registerAgentRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/agents/shipments/by-ref/:trackingRef',
    { preHandler: [authenticate, requireTenantMatch, requireRole([...AGENT_ALLOWED_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const { trackingRef } = request.params as { trackingRef: string };
      const normalizedRef = trackingRef.trim().toUpperCase();

      const shipment = await app.prisma.shipment.findFirst({
        where: { tenantId, trackingNumber: normalizedRef },
        include: {
          events: {
            orderBy: { timestamp: 'asc' },
            take: 100
          }
        }
      });

      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment not found' });
      }

      const actorIds = [...new Set(shipment.events.map((event) => event.actorId).filter((id): id is string => Boolean(id)))];
      const actors = actorIds.length
        ? await app.prisma.user.findMany({
            where: { tenantId, id: { in: actorIds } },
            select: { id: true, email: true }
          })
        : [];
      const actorMap = new Map(actors.map((actor) => [actor.id, actor.email]));

      const route = `${asAddressString(shipment.originAddress)} -> ${asAddressString(shipment.destinationAddress)}`;

      reply.send({
        shipment: {
          id: shipment.id,
          trackingRef: shipment.trackingNumber,
          status: shipment.status,
          route,
          direction: shipment.serviceTier,
          destinationAddress: asAddressString(shipment.destinationAddress),
          events: shipment.events.map((event) => ({
            id: event.id,
            fromStatus: null,
            toStatus: event.status,
            at: event.timestamp.toISOString(),
            location: asLocationLabel(event.location),
            notes: event.notes,
            actorEmail: event.actorId ? actorMap.get(event.actorId) ?? null : null
          }))
        }
      });
    }
  );

  app.post(
    '/api/v1/agents/shipments/advance',
    { preHandler: [authenticate, requireTenantMatch, requireRole([...AGENT_ALLOWED_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const userId = request.user?.sub;
      const actorRole = request.user?.role;
      if (!userId || !actorRole) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const payload = request.body as {
        trackingRef?: string;
        location?: string;
        notes?: string;
      };

      const trackingRef = compactText(payload.trackingRef ?? '').toUpperCase();
      const location = compactText(payload.location ?? '');
      const notes = compactText(payload.notes ?? '');

      if (!trackingRef || !/^[A-Z0-9-]{6,40}$/.test(trackingRef)) {
        return reply.status(400).send({ error: 'Invalid trackingRef' });
      }

      if (!location || !notes) {
        return reply.status(400).send({ error: 'location and notes are required' });
      }

      const shipment = await app.prisma.shipment.findFirst({
        where: { tenantId, trackingNumber: trackingRef }
      });

      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment not found' });
      }

      const nextStatus = getNextStatus(shipment.status);
      if (!nextStatus) {
        return reply.status(400).send({ error: `No available next status for ${shipment.status}` });
      }

      const previousStatus = shipment.status;
      const eventNotes = `Location: ${location}\nNotes: ${notes}`;

      const result = await app.prisma.$transaction(async (tx) => {
        const updatedShipment = await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status: nextStatus,
            notes: [shipment.notes, `Agent update: ${notes}`].filter(Boolean).join('\n'),
            actualDelivery: nextStatus === 'DELIVERED' ? new Date() : shipment.actualDelivery
          }
        });

        const event = await tx.shipmentEvent.create({
          data: {
            tenantId,
            shipmentId: shipment.id,
            status: nextStatus,
            location: { label: location } as Prisma.InputJsonValue,
            notes: eventNotes,
            actorId: userId,
            actorType: actorRole,
            source: 'AGENT_APP'
          }
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorId: userId,
            actorType: actorRole,
            actorIp: request.ip,
            action: 'AGENT_SHIPMENT_ADVANCE',
            resourceType: 'shipment',
            resourceId: shipment.id,
            beforeState: { status: previousStatus } as Prisma.InputJsonValue,
            afterState: { status: nextStatus } as Prisma.InputJsonValue,
            metadata: {
              trackingRef,
              location,
              notes
            } as Prisma.InputJsonValue
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
              trackingNumber: trackingRef,
              status: nextStatus,
              notes,
              location,
              source: 'AGENT_APP',
              timestamp: event.timestamp.toISOString()
            } as Prisma.InputJsonValue
          }
        });

        return { updatedShipment, event };
      });

      reply.send({
        success: true,
        shipmentId: result.updatedShipment.id,
        trackingRef,
        previousStatus,
        currentStatus: result.updatedShipment.status,
        nextStatus: getNextStatus(result.updatedShipment.status),
        timestamp: result.event.timestamp.toISOString()
      });
    }
  );

  app.get(
    '/api/v1/agents/shipments/recent',
    { preHandler: [authenticate, requireTenantMatch, requireRole([...AGENT_ALLOWED_ROLES])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const userId = request.user?.sub;
      if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

      const { limit } = request.query as { limit?: string };
      const parsedLimit = Math.min(100, Math.max(1, Number(limit ?? 20)));

      const events = await app.prisma.shipmentEvent.findMany({
        where: {
          tenantId,
          actorId: userId
        },
        include: {
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              status: true
            }
          }
        },
        orderBy: { timestamp: 'desc' },
        take: parsedLimit * 5
      });

      const byShipment = new Map<string, (typeof events)[number]>();
      for (const event of events) {
        if (!event.shipment) continue;
        if (!byShipment.has(event.shipment.id)) {
          byShipment.set(event.shipment.id, event);
        }
        if (byShipment.size >= parsedLimit) break;
      }

      const data = Array.from(byShipment.values()).map((event) => ({
        shipmentId: event.shipment.id,
        trackingRef: event.shipment.trackingNumber,
        status: event.shipment.status,
        lastActionAt: event.timestamp.toISOString(),
        lastLocation: asLocationLabel(event.location),
        lastNotes: event.notes ?? null
      }));

      reply.send({ data });
    }
  );
}