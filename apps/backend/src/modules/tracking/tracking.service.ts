import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  TrackingStatus,
  TrackingSource,
  TrackingActorType,
  TrackingVisibility,
  CUSTOMER_STATUS_MAP,
  CUSTOMER_MESSAGE_MAP,
  type CreateTrackingEventInput,
  type FieldSyncEvent,
  type FieldSyncResult
} from '@fauward/tracking-core';
import { createTrackingEvent, buildStatusTitle, statusToEventType } from './tracking-event.service.js';
import { filterEventsByVisibility } from './tracking-visibility.service.js';
import { triggerTrackingNotifications } from './tracking-notification.service.js';
import { triggerTrackingWebhooks } from './tracking-webhook.service.js';
import { emitTrackingStatusUpdate } from './tracking.websocket.js';
import { legacyToTrackingStatus } from './tracking-status-mapper.js';

export async function recordTrackingEvent(
  app: FastifyInstance,
  input: CreateTrackingEventInput & { plan?: string }
): Promise<string> {
  const { plan, ...eventInput } = input;

  const { eventId, isDuplicate } = await createTrackingEvent(app.prisma, eventInput);
  if (isDuplicate) return eventId;

  const event = await app.prisma.trackingEvent.findUniqueOrThrow({
    where: { id: eventId }
  });

  emitTrackingStatusUpdate({
    tenantId: event.tenantId,
    trackingNumber: event.trackingNumber,
    status: event.status,
    timestamp: event.occurredAt.toISOString()
  });

  const isCustomerVisible = event.visibility === TrackingVisibility.CUSTOMER_VISIBLE;

  if (isCustomerVisible) {
    const status = event.status as TrackingStatus;
    const customerStatus = CUSTOMER_STATUS_MAP[status] ?? status;

    void triggerTrackingNotifications(app, {
      tenantId: event.tenantId,
      shipmentId: event.shipmentId,
      trackingNumber: event.trackingNumber,
      status,
      plan
    });

    void triggerTrackingWebhooks(app, {
      tenantId: event.tenantId,
      shipmentId: event.shipmentId,
      trackingNumber: event.trackingNumber,
      status,
      eventId: event.id,
      occurredAt: event.occurredAt,
      customerStatus
    });
  }

  return eventId;
}

export async function getPublicTrackingView(
  prisma: PrismaClient,
  trackingNumber: string,
  tenantId: string
) {
  const [snapshot, events, tenant] = await Promise.all([
    prisma.trackingSnapshot.findFirst({
      where: { tenantId, trackingNumber }
    }),
    prisma.trackingEvent.findMany({
      where: {
        tenantId,
        trackingNumber,
        visibility: 'CUSTOMER_VISIBLE'
      },
      orderBy: { occurredAt: 'asc' }
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoUrl: true }
    })
  ]);

  if (!snapshot) return null;

  return {
    trackingNumber,
    tenant: {
      name: tenant?.name ?? 'Fauward',
      logoUrl: tenant?.logoUrl ?? null
    },
    status: snapshot.customerStatus,
    message: snapshot.currentMessage ?? '',
    estimatedDeliveryAt: snapshot.estimatedDeliveryAt?.toISOString() ?? null,
    deliveredAt: snapshot.deliveredAt?.toISOString() ?? null,
    destination: {
      city: snapshot.destinationName ?? null,
      country: null
    },
    timeline: events.map((e) => ({
      title: e.title,
      description: e.description ?? e.title,
      location: e.locationName ?? e.city ?? null,
      occurredAt: e.occurredAt.toISOString()
    }))
  };
}

export async function getTenantTrackingView(
  prisma: PrismaClient,
  shipmentId: string,
  tenantId: string
) {
  const [snapshot, events, shipment] = await Promise.all([
    prisma.trackingSnapshot.findUnique({
      where: { shipmentId }
    }),
    prisma.trackingEvent.findMany({
      where: {
        shipmentId,
        tenantId,
        visibility: { in: ['CUSTOMER_VISIBLE', 'FIELD_VISIBLE', 'TENANT_INTERNAL'] }
      },
      orderBy: { occurredAt: 'asc' }
    }),
    prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: {
        driver: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        podAssets: true
      }
    })
  ]);

  if (!shipment) return null;

  const customerTimeline = filterEventsByVisibility(events, 'customer');
  const tenantTimeline = filterEventsByVisibility(events, 'tenant');

  return {
    snapshot,
    tenantTimeline,
    customerTimelinePreview: customerTimeline,
    shipment: {
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      estimatedDelivery: shipment.estimatedDelivery,
      actualDelivery: shipment.actualDelivery,
      driver: shipment.driver
        ? {
            id: shipment.driver.id,
            name: [shipment.driver.user.firstName, shipment.driver.user.lastName].filter(Boolean).join(' '),
            email: shipment.driver.user.email
          }
        : null,
      podAssets: shipment.podAssets
    }
  };
}

export async function getPlatformTrackingView(
  prisma: PrismaClient,
  shipmentId: string
) {
  const [snapshot, events, shipment] = await Promise.all([
    prisma.trackingSnapshot.findUnique({ where: { shipmentId } }),
    prisma.trackingEvent.findMany({
      where: { shipmentId },
      orderBy: { occurredAt: 'asc' }
    }),
    prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true, plan: true } }
      }
    })
  ]);

  if (!shipment) return null;

  return {
    snapshot,
    allEvents: events,
    shipment: {
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      tenantId: shipment.tenantId,
      tenant: shipment.tenant,
      status: shipment.status
    }
  };
}

export async function syncFieldTrackingEvents(
  app: FastifyInstance,
  actorId: string,
  tenantId: string,
  fieldEvents: FieldSyncEvent[]
): Promise<FieldSyncResult> {
  const accepted: FieldSyncResult['accepted'] = [];
  const rejected: FieldSyncResult['rejected'] = [];

  for (const fe of fieldEvents) {
    try {
      const shipment = await app.prisma.shipment.findFirst({
        where: { id: fe.shipmentId, tenantId },
        select: { id: true, trackingNumber: true }
      });

      if (!shipment) {
        rejected.push({ clientEventId: fe.clientEventId, reason: 'Shipment not found' });
        continue;
      }

      const { eventId, isDuplicate } = await createTrackingEvent(app.prisma, {
        tenantId,
        shipmentId: shipment.id,
        trackingNumber: fe.trackingNumber ?? shipment.trackingNumber,
        eventType: fe.eventType,
        status: fe.status,
        title: fe.title,
        description: fe.description,
        source: TrackingSource.FAUWARD_GO,
        actorType: TrackingActorType.FIELD_USER,
        actorId,
        visibility: TrackingVisibility.CUSTOMER_VISIBLE,
        locationName: fe.locationName,
        city: fe.city,
        country: fe.country,
        lat: fe.lat,
        lng: fe.lng,
        idempotencyKey: fe.idempotencyKey,
        occurredAt: fe.occurredAt ? new Date(fe.occurredAt) : new Date(),
        skipTransitionCheck: false
      });

      if (!isDuplicate) {
        emitTrackingStatusUpdate({
          tenantId,
          trackingNumber: fe.trackingNumber ?? shipment.trackingNumber,
          status: fe.status,
          timestamp: (fe.occurredAt ? new Date(fe.occurredAt) : new Date()).toISOString()
        });
      }

      accepted.push({ clientEventId: fe.clientEventId, serverEventId: eventId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      rejected.push({ clientEventId: fe.clientEventId, reason: msg });
    }
  }

  return { accepted, rejected };
}

export async function createInitialTrackingEvent(
  app: FastifyInstance,
  shipmentId: string,
  tenantId: string,
  trackingNumber: string,
  legacyStatus: string,
  source: TrackingSource = TrackingSource.TENANT_PORTAL,
  actorId?: string
): Promise<string> {
  const status = legacyToTrackingStatus(legacyStatus);

  return recordTrackingEvent(app, {
    tenantId,
    shipmentId,
    trackingNumber,
    eventType: statusToEventType(status),
    status,
    title: buildStatusTitle(status),
    source,
    actorType: actorId ? TrackingActorType.TENANT_USER : TrackingActorType.SYSTEM,
    actorId,
    visibility: TrackingVisibility.CUSTOMER_VISIBLE,
    skipTransitionCheck: true
  });
}
