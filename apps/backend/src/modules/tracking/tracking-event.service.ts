import { Prisma, type PrismaClient } from '@prisma/client';
import {
  TrackingStatus,
  TrackingEventType,
  TrackingSource,
  TrackingActorType,
  TrackingVisibility,
  CUSTOMER_STATUS_MAP,
  type CreateTrackingEventInput
} from '@fauward/tracking-core';
import { validateTrackingTransition } from './tracking-policy.service.js';
import { upsertTrackingSnapshot } from './tracking-snapshot.service.js';
import { defaultVisibilityForStatus } from './tracking-visibility.service.js';

export interface CreateEventResult {
  eventId: string;
  isDuplicate: boolean;
}

export async function createTrackingEvent(
  prisma: PrismaClient,
  input: CreateTrackingEventInput
): Promise<CreateEventResult> {
  // Idempotency check
  if (input.idempotencyKey) {
    const existing = await prisma.trackingEvent.findFirst({
      where: {
        tenantId: input.tenantId,
        shipmentId: input.shipmentId,
        idempotencyKey: input.idempotencyKey
      },
      select: { id: true }
    });
    if (existing) {
      return { eventId: existing.id, isDuplicate: true };
    }
  }

  // Load current snapshot for transition validation
  const snapshot = await prisma.trackingSnapshot.findUnique({
    where: { shipmentId: input.shipmentId },
    select: { currentStatus: true }
  });

  if (snapshot && !input.skipTransitionCheck) {
    const result = validateTrackingTransition(
      snapshot.currentStatus as TrackingStatus,
      input.status,
      { overrideReason: input.overrideReason }
    );
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Invalid tracking status transition');
    }
  }

  const occurredAt = input.occurredAt ?? new Date();
  const visibility = (input.visibility ?? defaultVisibilityForStatus(input.status)) as TrackingVisibility;

  const event = await prisma.trackingEvent.create({
    data: {
      tenantId: input.tenantId,
      shipmentId: input.shipmentId,
      trackingNumber: input.trackingNumber,
      eventType: input.eventType,
      status: input.status,
      title: input.title,
      description: input.description ?? null,
      source: input.source,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      visibility,
      locationName: input.locationName ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      country: input.country ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      metadata: input.metadata ? (input.metadata as object) : Prisma.JsonNull,
      idempotencyKey: input.idempotencyKey ?? null,
      occurredAt
    }
  });

  // Load shipment for snapshot context
  const shipment = await prisma.shipment.findUnique({
    where: { id: input.shipmentId },
    select: {
      estimatedDelivery: true,
      assignedDriverId: true,
      vehicleId: true,
      originAddress: true,
      destinationAddress: true
    }
  });

  const originName = extractCity(shipment?.originAddress);
  const destinationName = extractCity(shipment?.destinationAddress);

  await upsertTrackingSnapshot(prisma, event, {
    originName,
    destinationName,
    estimatedDeliveryAt: shipment?.estimatedDelivery ?? null,
    assignedDriverId: shipment?.assignedDriverId ?? null,
    assignedVehicleId: shipment?.vehicleId ?? null
  });

  return { eventId: event.id, isDuplicate: false };
}

function extractCity(address: unknown): string | undefined {
  if (!address || typeof address !== 'object') return undefined;
  const rec = address as Record<string, unknown>;
  const city = rec.city ?? rec.town ?? rec.locality;
  if (typeof city === 'string' && city.trim()) return city.trim();
  return undefined;
}

export function buildStatusTitle(status: TrackingStatus): string {
  const TITLES: Record<TrackingStatus, string> = {
    CREATED: 'Shipment created',
    BOOKED: 'Shipment booked',
    LABEL_GENERATED: 'Label generated',
    ASSIGNED: 'Driver assigned',
    PICKUP_SCHEDULED: 'Pickup scheduled',
    PICKED_UP: 'Picked up',
    AT_ORIGIN_HUB: 'At origin hub',
    DEPARTED_ORIGIN_HUB: 'Departed origin hub',
    IN_TRANSIT: 'In transit',
    AT_DESTINATION_HUB: 'At destination hub',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERY_ATTEMPTED: 'Delivery attempted',
    DELIVERED: 'Delivered',
    FAILED_DELIVERY: 'Delivery failed',
    EXCEPTION: 'Exception raised',
    CUSTOMS_HOLD: 'Customs hold',
    CUSTOMS_RELEASED: 'Customs released',
    RETURN_STARTED: 'Return started',
    RETURNED: 'Returned',
    CANCELLED: 'Cancelled'
  };
  return TITLES[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function statusToEventType(status: TrackingStatus): TrackingEventType {
  const MAP: Partial<Record<TrackingStatus, TrackingEventType>> = {
    CREATED: TrackingEventType.SHIPMENT_CREATED,
    BOOKED: TrackingEventType.SHIPMENT_BOOKED,
    LABEL_GENERATED: TrackingEventType.LABEL_GENERATED,
    ASSIGNED: TrackingEventType.DRIVER_ASSIGNED,
    PICKUP_SCHEDULED: TrackingEventType.PICKUP_SCHEDULED,
    PICKED_UP: TrackingEventType.PICKED_UP,
    AT_ORIGIN_HUB: TrackingEventType.ARRIVED_AT_HUB,
    DEPARTED_ORIGIN_HUB: TrackingEventType.DEPARTED_HUB,
    IN_TRANSIT: TrackingEventType.IN_TRANSIT,
    AT_DESTINATION_HUB: TrackingEventType.ARRIVED_AT_HUB,
    OUT_FOR_DELIVERY: TrackingEventType.OUT_FOR_DELIVERY,
    DELIVERY_ATTEMPTED: TrackingEventType.DELIVERY_ATTEMPTED,
    DELIVERED: TrackingEventType.DELIVERED,
    FAILED_DELIVERY: TrackingEventType.FAILED_DELIVERY,
    EXCEPTION: TrackingEventType.EXCEPTION_RAISED,
    CUSTOMS_HOLD: TrackingEventType.CUSTOMS_HOLD,
    CUSTOMS_RELEASED: TrackingEventType.CUSTOMS_RELEASED,
    RETURN_STARTED: TrackingEventType.RETURN_STARTED,
    RETURNED: TrackingEventType.RETURNED,
    CANCELLED: TrackingEventType.CANCELLED
  };
  return MAP[status] ?? TrackingEventType.STATUS_OVERRIDE;
}
