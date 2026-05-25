import type { FastifyInstance } from 'fastify';

import { config } from '../../config/index.js';
import { createInAppNotifications } from '../notifications/notifications.routes.js';
import { sendEmail } from '../notifications/notifications.service.js';

export interface NotifyManagersInput {
  tenantId: string;
  requestId: string;
  trackingNumber: string;
  shipmentStatus: string;
  requesterName: string;
  currentDriverName: string | null;
  note: string | null;
}

export async function notifyManagersOfRequest(app: FastifyInstance, input: NotifyManagersInput) {
  const managers = await app.prisma.user.findMany({
    where: {
      tenantId: input.tenantId,
      role: { in: ['TENANT_MANAGER', 'TENANT_ADMIN'] },
      isActive: true
    },
    select: { id: true, email: true }
  });

  if (managers.length === 0) {
    app.log.warn({ tenantId: input.tenantId, requestId: input.requestId }, 'permission request created but no approvers on tenant');
    return;
  }

  const link = `/operations/permission-requests?focus=${input.requestId}`;

  await createInAppNotifications(app, {
    tenantId: input.tenantId,
    userIds: managers.map((m) => m.id),
    type: 'permission_request',
    title: `${input.requesterName} wants to handle ${input.trackingNumber}`,
    body: input.note ?? undefined,
    link
  });

  const approveUrl = `${config.tenantPortalUrl}${link}`;
  await Promise.all(
    managers
      .filter((m) => m.email)
      .map((manager) =>
        sendEmail(app, {
          tenantId: input.tenantId,
          to: manager.email,
          userId: manager.id,
          template: 'permission_request_approval',
          data: {
            requesterName: input.requesterName,
            trackingNumber: input.trackingNumber,
            shipmentStatus: input.shipmentStatus,
            currentDriverName: input.currentDriverName ?? 'Unassigned',
            note: input.note ?? '',
            approveUrl
          }
        })
      )
  );
}

export async function notifyRequester(
  app: FastifyInstance,
  args: {
    tenantId: string;
    requestId: string;
    requesterUserId: string;
    decision: 'APPROVED' | 'REJECTED';
    trackingNumber: string;
    reason?: string | null;
  }
) {
  const isApproved = args.decision === 'APPROVED';
  // Driver-facing notification — link omitted because the requester is on the
  // fauward-Go PWA, not the tenant portal where NotificationCenter renders.
  await createInAppNotifications(app, {
    tenantId: args.tenantId,
    userIds: [args.requesterUserId],
    type: isApproved ? 'permission_request_approved' : 'permission_request_rejected',
    title: isApproved
      ? `Permission approved for ${args.trackingNumber}`
      : `Permission request rejected for ${args.trackingNumber}`,
    body: args.reason ?? undefined
  });
}
