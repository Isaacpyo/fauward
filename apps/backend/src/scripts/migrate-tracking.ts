/**
 * Backfills existing ShipmentEvent records into TrackingEvent + TrackingSnapshot.
 * Safe to rerun — uses idempotency keys of the form `migration:{shipmentId}:{eventIndex}`.
 *
 * Usage:
 *   pnpm --filter @fauward/backend tsx src/scripts/migrate-tracking.ts
 *   or
 *   pnpm tracking:migrate
 */
import { PrismaClient } from '@prisma/client';
import {
  legacyToTrackingStatus,
  CUSTOMER_STATUS_MAP,
  CUSTOMER_MESSAGE_MAP
} from '@fauward/tracking-core';

const prisma = new PrismaClient();

// Heuristic: internal AI/system notes should not be CUSTOMER_VISIBLE
const INTERNAL_NOTE_PATTERNS = [
  /assigned to driver/i,
  /reason:/i,
  /available driver/i,
  /active jobs/i,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i // raw UUID in notes
];

function inferVisibility(notes: string | null, actorType: string | null, source: string): string {
  if (source === 'AI_AGENT' || actorType === 'AI_AGENT') return 'TENANT_INTERNAL';
  if (notes && INTERNAL_NOTE_PATTERNS.some((p) => p.test(notes))) return 'TENANT_INTERNAL';
  return 'CUSTOMER_VISIBLE';
}

const STATUS_TO_EVENT_TYPE: Record<string, string> = {
  CREATED: 'SHIPMENT_CREATED', BOOKED: 'SHIPMENT_BOOKED', LABEL_GENERATED: 'LABEL_GENERATED',
  ASSIGNED: 'DRIVER_ASSIGNED', PICKUP_SCHEDULED: 'PICKUP_SCHEDULED', PICKED_UP: 'PICKED_UP',
  AT_ORIGIN_HUB: 'ARRIVED_AT_HUB', DEPARTED_ORIGIN_HUB: 'DEPARTED_HUB',
  IN_TRANSIT: 'IN_TRANSIT', AT_DESTINATION_HUB: 'ARRIVED_AT_HUB',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY', DELIVERY_ATTEMPTED: 'DELIVERY_ATTEMPTED',
  DELIVERED: 'DELIVERED', FAILED_DELIVERY: 'FAILED_DELIVERY',
  EXCEPTION: 'EXCEPTION_RAISED', CUSTOMS_HOLD: 'CUSTOMS_HOLD',
  CUSTOMS_RELEASED: 'CUSTOMS_RELEASED', RETURN_STARTED: 'RETURN_STARTED',
  RETURNED: 'RETURNED', CANCELLED: 'CANCELLED'
};

const STATUS_TITLES: Record<string, string> = {
  CREATED: 'Shipment created', BOOKED: 'Shipment booked', LABEL_GENERATED: 'Label generated',
  ASSIGNED: 'Driver assigned', PICKUP_SCHEDULED: 'Pickup scheduled', PICKED_UP: 'Picked up',
  AT_ORIGIN_HUB: 'At origin hub', DEPARTED_ORIGIN_HUB: 'Departed origin hub',
  IN_TRANSIT: 'In transit', AT_DESTINATION_HUB: 'At destination hub',
  OUT_FOR_DELIVERY: 'Out for delivery', DELIVERY_ATTEMPTED: 'Delivery attempted',
  DELIVERED: 'Delivered', FAILED_DELIVERY: 'Delivery failed', EXCEPTION: 'Exception raised',
  CUSTOMS_HOLD: 'Customs hold', CUSTOMS_RELEASED: 'Customs released',
  RETURN_STARTED: 'Return started', RETURNED: 'Returned', CANCELLED: 'Cancelled'
};

async function migrateShipment(shipmentId: string): Promise<{ migrated: number; skipped: number }> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { events: { orderBy: { timestamp: 'asc' } } }
  });

  if (!shipment) return { migrated: 0, skipped: 0 };

  let migrated = 0;
  let skipped = 0;
  let lastEventId: string | null = null;
  let lastEventAt: Date | null = null;
  let lastTrackingStatus = 'CREATED';

  for (let i = 0; i < shipment.events.length; i++) {
    const legacyEvent = shipment.events[i];
    const idempotencyKey = `migration:${shipmentId}:${i}`;

    const existing = await prisma.trackingEvent.findFirst({
      where: { tenantId: shipment.tenantId, shipmentId, idempotencyKey },
      select: { id: true }
    });

    if (existing) {
      lastEventId = existing.id;
      lastEventAt = legacyEvent.timestamp;
      lastTrackingStatus = legacyToTrackingStatus(legacyEvent.status);
      skipped++;
      continue;
    }

    const trackingStatus = legacyToTrackingStatus(legacyEvent.status);
    const eventType = STATUS_TO_EVENT_TYPE[trackingStatus] ?? 'STATUS_OVERRIDE';
    const title = STATUS_TITLES[trackingStatus] ?? legacyEvent.status.replaceAll('_', ' ').toLowerCase();

    const visibility = inferVisibility(legacyEvent.notes, legacyEvent.actorType, legacyEvent.source);

    const created = await prisma.trackingEvent.create({
      data: {
        tenantId: shipment.tenantId,
        shipmentId,
        trackingNumber: shipment.trackingNumber,
        eventType: eventType as never,
        status: trackingStatus as never,
        title,
        description: legacyEvent.notes ?? null,
        source: 'MIGRATION',
        actorType: 'SYSTEM',
        actorId: legacyEvent.actorId ?? null,
        visibility: visibility as never,
        idempotencyKey,
        occurredAt: legacyEvent.timestamp
      }
    });

    lastEventId = created.id;
    lastEventAt = legacyEvent.timestamp;
    lastTrackingStatus = trackingStatus;
    migrated++;
  }

  // If no legacy events, seed from shipment.status
  if (shipment.events.length === 0) {
    const idempotencyKey = `migration:${shipmentId}:init`;
    const existing = await prisma.trackingEvent.findFirst({
      where: { tenantId: shipment.tenantId, shipmentId, idempotencyKey },
      select: { id: true }
    });

    if (!existing) {
      const trackingStatus = legacyToTrackingStatus(shipment.status);
      const created = await prisma.trackingEvent.create({
        data: {
          tenantId: shipment.tenantId,
          shipmentId,
          trackingNumber: shipment.trackingNumber,
          eventType: (STATUS_TO_EVENT_TYPE[trackingStatus] ?? 'SHIPMENT_CREATED') as never,
          status: trackingStatus as never,
          title: STATUS_TITLES[trackingStatus] ?? 'Shipment status',
          source: 'MIGRATION',
          actorType: 'SYSTEM',
          visibility: 'CUSTOMER_VISIBLE',
          idempotencyKey,
          occurredAt: shipment.createdAt
        }
      });
      lastEventId = created.id;
      lastEventAt = shipment.createdAt;
      lastTrackingStatus = trackingStatus;
      migrated++;
    }
  }

  // Upsert snapshot
  const finalStatus = legacyToTrackingStatus(shipment.status);
  const customerStatus = CUSTOMER_STATUS_MAP[finalStatus as keyof typeof CUSTOMER_STATUS_MAP] ?? finalStatus;
  const customerMessage = CUSTOMER_MESSAGE_MAP[finalStatus as keyof typeof CUSTOMER_MESSAGE_MAP] ?? null;
  const originAddr = shipment.originAddress as Record<string, unknown>;
  const destAddr = shipment.destinationAddress as Record<string, unknown>;

  const snapshotExists = await prisma.trackingSnapshot.findUnique({
    where: { shipmentId },
    select: { id: true }
  });

  const snapshotData = {
    tenantId: shipment.tenantId,
    trackingNumber: shipment.trackingNumber,
    currentStatus: finalStatus as never,
    operationalStatus: finalStatus as never,
    customerStatus,
    currentTitle: STATUS_TITLES[finalStatus] ?? 'Status update',
    currentMessage: customerMessage,
    lastEventId,
    lastEventAt,
    originName: extractCity(originAddr),
    destinationName: extractCity(destAddr),
    estimatedDeliveryAt: shipment.estimatedDelivery ?? null,
    deliveredAt: shipment.actualDelivery ?? null,
    hasException: finalStatus === 'EXCEPTION',
    assignedDriverId: shipment.assignedDriverId ?? null,
    assignedVehicleId: shipment.vehicleId ?? null
  };

  if (!snapshotExists) {
    await prisma.trackingSnapshot.create({ data: { shipmentId, ...snapshotData } });
  } else {
    await prisma.trackingSnapshot.update({ where: { shipmentId }, data: snapshotData });
  }

  return { migrated, skipped };
}

function extractCity(addr: Record<string, unknown> | null | undefined): string | null {
  if (!addr) return null;
  const city = addr.city ?? addr.town ?? addr.locality;
  return typeof city === 'string' && city.trim() ? city.trim() : null;
}

async function run() {
  console.log('Starting tracking migration...');

  const batchSize = 100;
  let offset = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalShipments = 0;

  for (;;) {
    const shipments = await prisma.shipment.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: batchSize
    });

    if (shipments.length === 0) break;

    for (const s of shipments) {
      const { migrated, skipped } = await migrateShipment(s.id);
      totalMigrated += migrated;
      totalSkipped += skipped;
      totalShipments++;
    }

    console.log(`Processed ${totalShipments} shipments (batch offset ${offset})...`);
    offset += batchSize;
  }

  console.log(`Migration complete.`);
  console.log(`  Shipments processed : ${totalShipments}`);
  console.log(`  Events migrated     : ${totalMigrated}`);
  console.log(`  Events skipped      : ${totalSkipped} (already migrated)`);

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
