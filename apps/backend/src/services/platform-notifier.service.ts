import type { FastifyInstance } from 'fastify';
import type { ActivitySeverity } from '@prisma/client';
import type { Permission } from '@fauward/internal-rbac';
import { createInAppNotifications } from '../modules/notifications/notifications.routes.js';
import { sendEmail, sendStaffEmail } from '../modules/notifications/notifications.service.js';
import { config } from '../config/index.js';
import type { EMAIL_TEMPLATES } from '../modules/notifications/email-templates.js';

// PlatformNotifier (D6): the one entrypoint for Fauward → tenant and Fauward → staff notifications. Tenant side reuses
// the existing in-app rows and the notification queue (the worker writes NotificationLog); staff side writes
// StaffNotification rows for the console bell. Call these after the mutation has committed: a notification failure is
// logged and never undoes or fails the action.

type EmailSpec = { template: keyof typeof EMAIL_TEMPLATES; data?: Record<string, unknown> };

export type TenantNotification = {
  tenantId: string;
  /** In-app notification type, e.g. `tenant.suspended`. */
  event: string;
  title: string;
  body?: string;
  link?: string;
  email?: EmailSpec;
};

export type NotifyResult = { inApp: number; emailsQueued: number };

type NotifierApp = FastifyInstance;

async function deliverToTenantUsers(app: NotifierApp, users: Array<{ id: string; email: string }>, input: TenantNotification): Promise<NotifyResult> {
  if (users.length === 0) return { inApp: 0, emailsQueued: 0 };
  await createInAppNotifications(app, {
    tenantId: input.tenantId,
    userIds: users.map((user) => user.id),
    type: input.event,
    title: input.title,
    body: input.body,
    link: input.link
  });

  let emailsQueued = 0;
  if (input.email) {
    const email = input.email;
    const results = await Promise.allSettled(
      users.map((user) => sendEmail(app, { tenantId: input.tenantId, userId: user.id, to: user.email, template: email.template, data: email.data }))
    );
    for (const result of results) {
      if (result.status === 'fulfilled') emailsQueued += 1;
      else app.log.error({ err: result.reason, tenantId: input.tenantId, event: input.event }, 'Failed to enqueue tenant notification email');
    }
  }
  return { inApp: users.length, emailsQueued };
}

/** Every active TENANT_ADMIN of the tenant gets one in-app notification (and the email, when given). */
export async function notifyTenantAdmins(app: NotifierApp, input: TenantNotification): Promise<NotifyResult> {
  try {
    const admins = await app.prisma.user.findMany({
      where: { tenantId: input.tenantId, role: 'TENANT_ADMIN', isActive: true },
      select: { id: true, email: true }
    });
    return await deliverToTenantUsers(app, admins, input);
  } catch (err) {
    app.log.error({ err, tenantId: input.tenantId, event: input.event }, 'Failed to notify tenant admins');
    return { inApp: 0, emailsQueued: 0 };
  }
}

export async function notifyTenantUser(app: NotifierApp, input: TenantNotification & { userId: string }): Promise<NotifyResult> {
  try {
    const user = await app.prisma.user.findFirst({
      where: { id: input.userId, tenantId: input.tenantId, isActive: true },
      select: { id: true, email: true }
    });
    return await deliverToTenantUsers(app, user ? [user] : [], input);
  } catch (err) {
    app.log.error({ err, tenantId: input.tenantId, event: input.event }, 'Failed to notify tenant user');
    return { inApp: 0, emailsQueued: 0 };
  }
}

export type StaffNotificationInput = ({ permission: Permission; platformUserIds?: never } | { platformUserIds: string[]; permission?: never }) & {
  event: string;
  title: string;
  body?: string;
  link?: string;
  severity?: ActivitySeverity;
  tenantId?: string | null;
  /** Never notify these staff, e.g. the requester of a JIT request who also holds the approve permission. */
  excludePlatformUserIds?: string[];
  /** Also email each recipient (`staff_notification` template, through the notification worker). */
  email?: boolean;
};

/** Platform users of active staff holding `permission` through an unexpired role assignment. */
async function platformUsersWithPermission(app: NotifierApp, permission: Permission) {
  const now = new Date();
  const staff = await app.prisma.staffUser.findMany({
    where: {
      status: 'ACTIVE',
      platformUserId: { not: null },
      roleAssignments: { some: { role: { permissions: { has: permission } }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }
    },
    select: { platformUserId: true }
  });
  return staff.flatMap((row) => (row.platformUserId ? [row.platformUserId] : []));
}

/**
 * Console bell entries (StaffNotification) for the given staff, or for every active staff member holding a permission;
 * with `email: true` each recipient also gets an email (logged by the worker without a tenant, WP-2.2).
 */
export async function notifyStaff(app: NotifierApp, input: StaffNotificationInput): Promise<{ inApp: number; emailsQueued?: number }> {
  try {
    const excluded = new Set(input.excludePlatformUserIds ?? []);
    const candidates = input.permission ? await platformUsersWithPermission(app, input.permission) : [...new Set(input.platformUserIds)];
    const recipients = candidates.filter((platformUserId) => !excluded.has(platformUserId));
    if (recipients.length === 0) return { inApp: 0 };
    await app.prisma.staffNotification.createMany({
      data: recipients.map((platformUserId) => ({
        platformUserId,
        event: input.event,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        severity: input.severity ?? 'INFO',
        tenantId: input.tenantId ?? null
      }))
    });
    if (!input.email) return { inApp: recipients.length };
    const users = await app.prisma.platformUser.findMany({ where: { id: { in: recipients }, status: 'ACTIVE' }, select: { id: true, email: true } });
    const link = input.link ? `${config.consoleUrl}${input.link}` : undefined;
    const results = await Promise.allSettled(
      users.map((user) => sendStaffEmail({ platformUserId: user.id, to: user.email, template: 'staff_notification', data: { title: input.title, body: input.body, link } }))
    );
    const emailsQueued = results.filter((result) => result.status === 'fulfilled').length;
    if (emailsQueued < users.length) app.log.error({ event: input.event, failed: users.length - emailsQueued }, 'Failed to enqueue some staff notification emails');
    return { inApp: recipients.length, emailsQueued };
  } catch (err) {
    app.log.error({ err, event: input.event }, 'Failed to notify staff');
    return { inApp: 0 };
  }
}
