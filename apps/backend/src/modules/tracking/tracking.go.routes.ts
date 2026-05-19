import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  TrackingSource,
  TrackingActorType,
  TrackingVisibility,
  type TrackingStatus,
  type FieldSyncEvent
} from '@fauward/tracking-core';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { recordTrackingEvent, syncFieldTrackingEvents } from './tracking.service.js';
import { buildStatusTitle, statusToEventType } from './tracking-event.service.js';
import { getAllowedNextStatuses } from './tracking-policy.service.js';
import { markPodAvailable } from './tracking-snapshot.service.js';
import { ingestTrackingPoints } from './realtime/ingest.service.js';

const FIELD_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF', 'TENANT_DRIVER'] as const;

function tenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const id = request.tenant?.id;
  if (!id) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return id;
}

export async function registerGoTrackingRoutes(app: FastifyInstance) {
  // Tracking view for a field job
  app.get(
    '/api/v1/go/jobs/:jobId/tracking',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole([...FIELD_ROLES])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { jobId } = request.params as { jobId: string };

      const stop = await app.prisma.routeStop.findFirst({
        where: { id: jobId },
        include: {
          shipment: {
            include: {
              items: true,
              trackingSnapshot: true
            }
          }
        }
      });

      if (!stop?.shipment) return reply.status(404).send({ error: 'Job not found' });

      const shipment = stop.shipment;
      const snapshot = shipment.trackingSnapshot;

      const allowedNextStatuses = snapshot
        ? getAllowedNextStatuses(snapshot.currentStatus as TrackingStatus)
        : [];

      // Field users see field-visible + customer-visible events
      const events = await app.prisma.trackingEvent.findMany({
        where: {
          shipmentId: shipment.id,
          tenantId: tid,
          visibility: { in: ['CUSTOMER_VISIBLE', 'FIELD_VISIBLE'] }
        },
        orderBy: { occurredAt: 'asc' }
      });

      return reply.send({
        job: {
          id: stop.id,
          sequence: stop.sequence,
          status: stop.status
        },
        shipment: {
          id: shipment.id,
          trackingNumber: shipment.trackingNumber,
          destinationAddress: shipment.destinationAddress,
          items: shipment.items,
          specialInstructions: shipment.specialInstructions
        },
        snapshot,
        timeline: events,
        allowedNextStatuses
      });
    }
  );

  // Submit a status update from the field
  app.post(
    '/api/v1/go/shipments/:shipmentId/status',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole([...FIELD_ROLES])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };

      const body = request.body as {
        status: TrackingStatus;
        description?: string;
        locationName?: string;
        city?: string;
        lat?: number;
        lng?: number;
        idempotencyKey?: string;
        occurredAt?: string;
      };

      if (!body.status) return reply.status(400).send({ error: 'status is required' });

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId: tid },
        select: { id: true, trackingNumber: true }
      });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      try {
        const eventId = await recordTrackingEvent(app, {
          tenantId: tid,
          shipmentId: shipment.id,
          trackingNumber: shipment.trackingNumber,
          eventType: statusToEventType(body.status),
          status: body.status,
          title: buildStatusTitle(body.status),
          description: body.description,
          source: TrackingSource.FAUWARD_GO,
          actorType: TrackingActorType.FIELD_USER,
          actorId: request.user?.sub,
          visibility: TrackingVisibility.CUSTOMER_VISIBLE,
          locationName: body.locationName,
          city: body.city,
          lat: body.lat,
          lng: body.lng,
          idempotencyKey: body.idempotencyKey,
          occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
          plan: request.tenant?.plan
        });

        return reply.status(201).send({ eventId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create tracking event';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Submit a GPS location ping from the field (FIELD_VISIBLE only)
  app.post(
    '/api/v1/go/shipments/:shipmentId/location',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole([...FIELD_ROLES])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };

      const body = request.body as {
        lat: number;
        lng: number;
        locationName?: string;
        city?: string;
        idempotencyKey?: string;
      };

      if (!body.lat || !body.lng) {
        return reply.status(400).send({ error: 'lat and lng are required' });
      }

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId: tid },
        select: { id: true, trackingNumber: true, trackingSnapshot: { select: { currentStatus: true } } }
      });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      const currentStatus = (shipment.trackingSnapshot?.currentStatus as TrackingStatus) ?? 'IN_TRANSIT';

      await recordTrackingEvent(app, {
        tenantId: tid,
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        eventType: 'LOCATION_UPDATED',
        status: currentStatus,
        title: 'Location updated',
        source: TrackingSource.FAUWARD_GO,
        actorType: TrackingActorType.DRIVER,
        actorId: request.user?.sub,
        visibility: TrackingVisibility.FIELD_VISIBLE,
        locationName: body.locationName,
        city: body.city,
        lat: body.lat,
        lng: body.lng,
        idempotencyKey: body.idempotencyKey,
        skipTransitionCheck: true
      });

      // Also pipe into realtime ingest pipeline
      await ingestTrackingPoints(app, {
        tenantId: tid,
        shipmentId: shipment.id,
        idempotencyKey: body.idempotencyKey ?? `${shipment.id}:${Date.now()}`,
        points: [{
          lat: body.lat,
          lng: body.lng,
          accuracy: undefined,
          ts: new Date().toISOString(),
          status: currentStatus,
        }],
        source: 'driver',
        sourceRef: request.user?.sub,
        driverId: request.user?.sub,
      });

      return reply.status(201).send({ ok: true });
    }
  );

  // Upload POD from the field
  app.post(
    '/api/v1/go/shipments/:shipmentId/pod',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole([...FIELD_ROLES])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;
      const { shipmentId } = request.params as { shipmentId: string };

      const body = request.body as {
        method: 'SIGNATURE' | 'PHOTO' | 'OTP' | 'NAME';
        recipientName?: string;
        signatureUrl?: string;
        photoUrls?: string[];
        otpVerified?: boolean;
        capturedAt?: string;
      };

      if (!body.method) return reply.status(400).send({ error: 'method is required' });

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId: tid },
        select: { id: true, trackingNumber: true }
      });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date();

      // Create POD record
      const pod = await app.prisma.proofOfDelivery.create({
        data: {
          tenantId: tid,
          shipmentId: shipment.id,
          method: body.method,
          recipientName: body.recipientName ?? null,
          signatureUrl: body.signatureUrl ?? null,
          photoUrls: body.photoUrls ?? [],
          otpVerified: body.otpVerified ?? false,
          capturedByUserId: request.user?.sub,
          capturedByActorType: request.user?.role ?? 'DRIVER',
          capturedAt
        }
      });

      // Mark snapshot as having POD
      await markPodAvailable(app.prisma, shipment.id);

      // Create a POD_UPLOADED tracking event
      const eventId = await recordTrackingEvent(app, {
        tenantId: tid,
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        eventType: 'POD_UPLOADED',
        status: 'DELIVERED',
        title: 'Proof of delivery uploaded',
        description: body.recipientName ? `Received by ${body.recipientName}` : undefined,
        source: TrackingSource.FAUWARD_GO,
        actorType: TrackingActorType.DRIVER,
        actorId: request.user?.sub,
        visibility: TrackingVisibility.CUSTOMER_VISIBLE,
        metadata: { podId: pod.id, method: body.method },
        plan: request.tenant?.plan
      });

      // Link POD to tracking event
      await app.prisma.proofOfDelivery.update({
        where: { id: pod.id },
        data: { trackingEventId: eventId }
      });

      return reply.status(201).send({ podId: pod.id, eventId });
    }
  );

  // Offline sync — batch submit field events
  app.post(
    '/api/v1/go/sync/tracking-events',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole([...FIELD_ROLES])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tid = tenantId(request, reply);
      if (!tid) return;

      const body = request.body as { events?: FieldSyncEvent[] };
      if (!Array.isArray(body.events) || body.events.length === 0) {
        return reply.status(400).send({ error: 'events array is required' });
      }

      if (body.events.length > 100) {
        return reply.status(400).send({ error: 'Maximum 100 events per sync batch' });
      }

      const result = await syncFieldTrackingEvents(
        app,
        request.user?.sub ?? 'unknown',
        tid,
        body.events
      );

      return reply.send(result);
    }
  );
}
