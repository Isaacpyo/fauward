import type { FastifyInstance } from 'fastify';
import type { TrackingStatus } from '@fauward/tracking-core';
import { notificationQueue } from '../../queues/queues.js';
import { createInAppNotifications } from '../notifications/notifications.routes.js';

const NOTIFICATION_TEMPLATES: Partial<Record<TrackingStatus, string>> = {
  PICKED_UP: 'shipment_picked_up',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERY_ATTEMPTED: 'delivery_attempted',
  DELIVERED: 'delivered',
  FAILED_DELIVERY: 'failed_delivery',
  EXCEPTION: 'shipment_exception',
  CUSTOMS_HOLD: 'shipment_exception',
  RETURN_STARTED: 'shipment_exception'
};

export async function triggerTrackingNotifications(
  app: FastifyInstance,
  args: {
    tenantId: string;
    shipmentId: string;
    trackingNumber: string;
    status: TrackingStatus;
    plan?: string;
  }
): Promise<void> {
  const template = NOTIFICATION_TEMPLATES[args.status];
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
      data: { trackingNumber: args.trackingNumber, status: args.status }
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
      data: { trackingNumber: args.trackingNumber, status: args.status }
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
      message: `Shipment ${args.trackingNumber}: ${args.status.replaceAll('_', ' ').toLowerCase()}.`
    });
  }

  await createInAppNotifications(app, {
    tenantId: args.tenantId,
    userIds: admins.map((a) => a.id),
    type: `shipment_${args.status.toLowerCase()}`,
    title: `Shipment ${args.trackingNumber} ${args.status.replaceAll('_', ' ').toLowerCase()}`,
    body: `Status updated to ${args.status}`,
    link: `/shipments/${args.shipmentId}`
  });
}
