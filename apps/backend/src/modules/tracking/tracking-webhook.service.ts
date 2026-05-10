import type { FastifyInstance } from 'fastify';
import type { TrackingStatus } from '@fauward/tracking-core';
import { webhookQueue } from '../../queues/queues.js';

const STATUS_TO_WEBHOOK_EVENT: Partial<Record<TrackingStatus, string>> = {
  DELIVERED: 'shipment.delivered',
  FAILED_DELIVERY: 'shipment.failed_delivery',
  DELIVERY_ATTEMPTED: 'shipment.delivery_attempted',
  EXCEPTION: 'shipment.exception',
  CUSTOMS_HOLD: 'shipment.exception',
  RETURN_STARTED: 'shipment.return_started',
  PICKED_UP: 'shipment.picked_up',
  OUT_FOR_DELIVERY: 'shipment.out_for_delivery'
};

export async function triggerTrackingWebhooks(
  app: FastifyInstance,
  args: {
    tenantId: string;
    shipmentId: string;
    trackingNumber: string;
    status: TrackingStatus;
    eventId: string;
    occurredAt: Date;
    customerStatus: string;
  }
): Promise<void> {
  const webhookEvent = STATUS_TO_WEBHOOK_EVENT[args.status] ?? 'tracking.event.created';

  const endpoints = await app.prisma.webhookEndpoint.findMany({
    where: { tenantId: args.tenantId, isActive: true, events: { has: webhookEvent } },
    select: { id: true }
  });

  if (endpoints.length === 0) return;

  const payload = {
    tenantId: args.tenantId,
    shipmentId: args.shipmentId,
    trackingNumber: args.trackingNumber,
    eventType: webhookEvent,
    status: args.status,
    customerStatus: args.customerStatus,
    occurredAt: args.occurredAt.toISOString(),
    eventId: args.eventId
  };

  await Promise.all(
    endpoints.map((endpoint) =>
      webhookQueue.add(webhookEvent, {
        endpointId: endpoint.id,
        eventType: webhookEvent,
        payload,
        tenantId: args.tenantId,
        shipmentId: args.shipmentId
      })
    )
  );
}
