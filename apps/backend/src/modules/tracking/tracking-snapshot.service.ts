import type { PrismaClient, TrackingEvent } from '@prisma/client';
import {
  CUSTOMER_STATUS_MAP,
  CUSTOMER_MESSAGE_MAP,
  type TrackingStatus
} from '@fauward/tracking-core';

export async function upsertTrackingSnapshot(
  prisma: PrismaClient,
  event: TrackingEvent,
  options: {
    originName?: string;
    destinationName?: string;
    estimatedDeliveryAt?: Date | null;
    assignedDriverId?: string | null;
    assignedVehicleId?: string | null;
  } = {}
): Promise<void> {
  const status = event.status as TrackingStatus;
  const customerStatus = CUSTOMER_STATUS_MAP[status] ?? 'In progress';
  const customerMessage = CUSTOMER_MESSAGE_MAP[status] ?? null;

  const isDelivered = status === 'DELIVERED';
  const isException = status === 'EXCEPTION';

  const baseData = {
    tenantId: event.tenantId,
    trackingNumber: event.trackingNumber,
    currentStatus: event.status,
    operationalStatus: event.status,
    customerStatus,
    currentTitle: event.title,
    currentMessage: customerMessage,
    lastEventId: event.id,
    lastEventAt: event.occurredAt,
    ...(options.originName !== undefined && { originName: options.originName }),
    ...(options.destinationName !== undefined && { destinationName: options.destinationName }),
    ...(options.estimatedDeliveryAt !== undefined && { estimatedDeliveryAt: options.estimatedDeliveryAt }),
    ...(options.assignedDriverId !== undefined && { assignedDriverId: options.assignedDriverId }),
    ...(options.assignedVehicleId !== undefined && { assignedVehicleId: options.assignedVehicleId }),
    ...(isDelivered && { deliveredAt: event.occurredAt }),
    ...(isException && {
      hasException: true,
      exceptionMessage: event.description ?? null
    }),
    ...(!isException && { hasException: false, exceptionCode: null, exceptionMessage: null })
  };

  await prisma.trackingSnapshot.upsert({
    where: { shipmentId: event.shipmentId },
    create: {
      shipmentId: event.shipmentId,
      ...baseData
    },
    update: baseData
  });
}

export async function markPodAvailable(prisma: PrismaClient, shipmentId: string): Promise<void> {
  await prisma.trackingSnapshot.updateMany({
    where: { shipmentId },
    data: { podAvailable: true }
  });
}
