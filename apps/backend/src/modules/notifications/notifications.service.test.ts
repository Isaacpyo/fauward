import { beforeEach, describe, expect, it, vi } from 'vitest';

const notificationAddMock = vi.hoisted(() => vi.fn(async () => ({ id: 'job-1' })));
const publishPythonServiceJobMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../queues/queues.js', () => ({
  notificationQueue: {
    add: notificationAddMock
  }
}));

vi.mock('../../queues/python-services.js', () => ({
  publishPythonServiceJob: publishPythonServiceJobMock
}));

import { EMAIL_TEMPLATES } from './email-templates.js';
import { sendEmail, sendSms } from './notifications.service.js';

beforeEach(() => {
  notificationAddMock.mockClear();
  publishPythonServiceJobMock.mockClear();
});

describe('sendEmail', () => {
  it('enqueues an email job with the correct channel and template', async () => {
    await sendEmail({} as any, {
      tenantId: 'tenant-1',
      to: 'customer@example.com',
      template: 'booking_confirmed',
      data: { trackingNumber: 'FWD-202506-A3F9K2' }
    });

    expect(notificationAddMock).toHaveBeenCalledWith('email', {
      tenantId: 'tenant-1',
      userId: undefined,
      channel: 'EMAIL',
      event: 'booking_confirmed',
      to: 'customer@example.com',
      template: EMAIL_TEMPLATES.booking_confirmed,
      data: { trackingNumber: 'FWD-202506-A3F9K2' }
    });
    expect(publishPythonServiceJobMock).not.toHaveBeenCalled();
  });

  it('publishes Python-service jobs for templates handled by that worker', async () => {
    const app = {} as any;
    const data = { trackingNumber: 'FWD-202506-XYZ', recipientName: 'John Smith' };

    await sendEmail(app, {
      tenantId: 'tenant-1',
      to: 'customer@example.com',
      template: 'delivered',
      data
    });

    expect(publishPythonServiceJobMock).toHaveBeenCalledWith(
      app,
      'fauward:notifications:send',
      expect.objectContaining({
        jobId: expect.any(String),
        tenantId: 'tenant-1',
        channel: 'email',
        templateKey: 'delivered',
        recipient: { email: 'customer@example.com' },
        variables: data,
        locale: 'en'
      })
    );
  });

  it('uses an empty object for data when none provided', async () => {
    await sendEmail({} as any, {
      tenantId: 'tenant-1',
      to: 'admin@example.com',
      template: 'trial_expiring'
    });

    expect(notificationAddMock).toHaveBeenCalledWith(
      'email',
      expect.objectContaining({
        data: {}
      })
    );
  });

  it('attaches userId to the job when provided', async () => {
    await sendEmail({} as any, {
      tenantId: 'tenant-1',
      to: 'user@example.com',
      template: 'staff_invite',
      userId: 'user-abc'
    });

    expect(notificationAddMock).toHaveBeenCalledWith(
      'email',
      expect.objectContaining({
        userId: 'user-abc'
      })
    );
  });
});

describe('sendSms', () => {
  it('enqueues an SMS job with the correct channel and message', async () => {
    await sendSms({} as any, {
      tenantId: 'tenant-1',
      to: '+447700900123',
      message: 'Your shipment FWD-202506-A3F9K2 is out for delivery.'
    });

    expect(notificationAddMock).toHaveBeenCalledWith('sms', {
      tenantId: 'tenant-1',
      userId: undefined,
      channel: 'SMS',
      event: 'sms_notification',
      to: '+447700900123',
      message: 'Your shipment FWD-202506-A3F9K2 is out for delivery.'
    });
  });
});

describe('EMAIL_TEMPLATES', () => {
  const requiredTemplates = [
    'booking_confirmed',
    'delivered',
    'failed_delivery',
    'shipment_exception',
    'invoice_sent',
    'invoice_overdue',
    'payment_received',
    'password_reset',
    'staff_invite',
    'trial_expiring',
    'usage_warning_80',
    'usage_limit_reached',
    'return_approved',
    'return_received',
    'return_refunded',
    'ticket_created',
    'ticket_reply_from_staff',
    'ticket_reply_from_customer',
    'ticket_resolved'
  ] as const;

  it.each(requiredTemplates)('defines template key: %s', (key) => {
    expect(EMAIL_TEMPLATES[key as keyof typeof EMAIL_TEMPLATES]).toBeDefined();
    expect(typeof EMAIL_TEMPLATES[key as keyof typeof EMAIL_TEMPLATES]).toBe('string');
  });
});
