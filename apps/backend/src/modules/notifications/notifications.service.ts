import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';

import { notificationQueue } from '../../queues/queues.js';
import { publishPythonServiceJob } from '../../queues/python-services.js';
import { EMAIL_TEMPLATES } from './email-templates.js';

const PYTHON_EMAIL_TEMPLATES = new Set([
  'shipment_created',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'invoice_sent'
]);

type TenantEmail = {
  tenantId: string;
  to: string;
  template: keyof typeof EMAIL_TEMPLATES;
  data?: Record<string, unknown>;
  userId?: string;
};

/** Queue-only tenant email, for services that have no Fastify instance (the worker writes the NotificationLog). */
export async function enqueueEmail(args: TenantEmail) {
  await notificationQueue.add('email', {
    tenantId: args.tenantId,
    userId: args.userId,
    channel: 'EMAIL',
    event: args.template,
    to: args.to,
    template: EMAIL_TEMPLATES[args.template],
    data: args.data ?? {}
  });
}

export async function sendEmail(app: FastifyInstance, args: TenantEmail) {
  await enqueueEmail(args);
  if (PYTHON_EMAIL_TEMPLATES.has(args.template)) {
    await publishPythonServiceJob(app, 'fauward:notifications:send', {
      jobId: crypto.randomUUID(),
      tenantId: args.tenantId,
      channel: 'email',
      templateKey: args.template,
      recipient: { email: args.to },
      variables: args.data ?? {},
      locale: 'en'
    });
  }
}

/** Fauward staff email (notifyStaff): no tenant; the worker logs it against the platform user. */
export async function sendStaffEmail(args: { platformUserId: string; to: string; template: keyof typeof EMAIL_TEMPLATES; data?: Record<string, unknown> }) {
  await notificationQueue.add('email', {
    tenantId: 'system',
    platformUserId: args.platformUserId,
    channel: 'EMAIL',
    event: args.template,
    to: args.to,
    template: EMAIL_TEMPLATES[args.template],
    data: args.data ?? {}
  });
}

export async function sendSms(
  app: FastifyInstance,
  args: {
    tenantId: string;
    to: string;
    message: string;
    userId?: string;
  }
) {
  await notificationQueue.add('sms', {
    tenantId: args.tenantId,
    userId: args.userId,
    channel: 'SMS',
    event: 'sms_notification',
    to: args.to,
    message: args.message
  });
}

export const notificationsService = {
  sendEmail,
  sendStaffEmail,
  sendSms
};
