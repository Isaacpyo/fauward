import { beforeEach, describe, expect, it } from 'vitest';

import { sendEmail, sendSms } from './notifications.service.js';
import { notificationQueue } from '../../queues/queues.js';
import { EMAIL_TEMPLATES } from './email-templates.js';

// ─────────────────────────────────────────────────────────────────────────────
// Drain the in-memory queue before each test to avoid bleed between tests
// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  notificationQueue.drain(1000);
});

// ─────────────────────────────────────────────────────────────────────────────
// sendEmail
// ─────────────────────────────────────────────────────────────────────────────

describe('sendEmail', () => {
  it('enqueues an email job with the correct channel and template', async () => {
    const app = {} as any;

    await sendEmail(app, {
      tenantId: 'tenant-1',
      to: 'customer@example.com',
      template: 'booking_confirmed',
      data: { trackingNumber: 'FWD-202506-A3F9K2' }
    });

    const jobs = notificationQueue.drain(10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe('email');
    expect(jobs[0].data.channel).toBe('EMAIL');
    expect(jobs[0].data.tenantId).toBe('tenant-1');
    expect(jobs[0].data.to).toBe('customer@example.com');
    expect(jobs[0].data.event).toBe('booking_confirmed');
    expect(jobs[0].data.template).toBe(EMAIL_TEMPLATES.booking_confirmed);
  });

  it('includes the dynamic template data in the job payload', async () => {
    const app = {} as any;

    await sendEmail(app, {
      tenantId: 'tenant-1',
      to: 'customer@example.com',
      template: 'delivered',
      data: { trackingNumber: 'FWD-202506-XYZ', recipientName: 'John Smith' }
    });

    const jobs = notificationQueue.drain(10);
    expect((jobs[0].data.data as any).trackingNumber).toBe('FWD-202506-XYZ');
    expect((jobs[0].data.data as any).recipientName).toBe('John Smith');
  });

  it('uses an empty object for data when none provided', async () => {
    const app = {} as any;

    await sendEmail(app, {
      tenantId: 'tenant-1',
      to: 'admin@example.com',
      template: 'trial_expiring'
    });

    const jobs = notificationQueue.drain(10);
    expect(jobs[0].data.data).toEqual({});
  });

  it('attaches userId to the job when provided', async () => {
    const app = {} as any;

    await sendEmail(app, {
      tenantId: 'tenant-1',
      to: 'user@example.com',
      template: 'staff_invite',
      userId: 'user-abc'
    });

    const jobs = notificationQueue.drain(10);
    expect(jobs[0].data.userId).toBe('user-abc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendSms
// ─────────────────────────────────────────────────────────────────────────────

describe('sendSms', () => {
  it('enqueues an SMS job with the correct channel and message', async () => {
    const app = {} as any;

    await sendSms(app, {
      tenantId: 'tenant-1',
      to: '+447700900123',
      message: 'Your shipment FWD-202506-A3F9K2 is out for delivery.'
    });

    const jobs = notificationQueue.drain(10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe('sms');
    expect(jobs[0].data.channel).toBe('SMS');
    expect(jobs[0].data.to).toBe('+447700900123');
    expect(jobs[0].data.message).toBe('Your shipment FWD-202506-A3F9K2 is out for delivery.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL_TEMPLATES completeness
// ─────────────────────────────────────────────────────────────────────────────

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
