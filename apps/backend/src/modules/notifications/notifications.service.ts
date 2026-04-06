import type { FastifyInstance } from 'fastify';

import { notificationQueue } from '../../queues/queues.js';
import { EMAIL_TEMPLATES } from './email-templates.js';

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
