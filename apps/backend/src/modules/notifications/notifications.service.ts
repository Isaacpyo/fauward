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

export async function sendEmail(
  app: FastifyInstance,
  args: {
    tenantId: string;
    to: string;
    template: keyof typeof EMAIL_TEMPLATES;
    data?: Record<string, unknown>;
    userId?: string;
  }
) {
  await notificationQueue.add('email', {
    tenantId: args.tenantId,
    userId: args.userId,
    channel: 'EMAIL',
    event: args.template,
    to: args.to,
    template: EMAIL_TEMPLATES[args.template],
    data: args.data ?? {}
  });
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
  sendSms
};
