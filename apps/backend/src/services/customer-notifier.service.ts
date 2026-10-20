import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { sendEmail } from '../modules/notifications/notifications.service.js';
import type { EmailTemplateKey } from '../modules/notifications/email-templates.js';

// A tenant notifying its own customers (invoices, payments, quotes, delivery problems). Replaces the direct
// NotificationLog QUEUED rows that were never sent (C1): the email is queued and the worker writes the log. Like
// PlatformNotifier, a notification failure is logged and never fails the business action that triggered it.

type RecipientRef = { tenantId: string; userId?: string | null; organisationId?: string | null; leadId?: string | null };

/** The customer's email: the linked user, else the organisation's billing email, else the lead's email. */
export async function customerRecipient(prisma: Pick<PrismaClient, 'user' | 'organisation' | 'lead'>, ref: RecipientRef) {
  if (ref.userId) {
    const user = await prisma.user.findFirst({ where: { id: ref.userId, tenantId: ref.tenantId, isActive: true }, select: { id: true, email: true } });
    if (user?.email) return { to: user.email, userId: user.id };
  }
  if (ref.organisationId) {
    const organisation = await prisma.organisation.findFirst({ where: { id: ref.organisationId, tenantId: ref.tenantId }, select: { billingEmail: true } });
    if (organisation?.billingEmail) return { to: organisation.billingEmail, userId: undefined };
  }
  if (ref.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: ref.leadId, tenantId: ref.tenantId }, select: { email: true } });
    if (lead?.email) return { to: lead.email, userId: undefined };
  }
  return null;
}

export async function notifyCustomer(
  app: FastifyInstance,
  input: RecipientRef & { template: EmailTemplateKey; data?: Record<string, unknown> }
): Promise<{ queued: boolean }> {
  try {
    const recipient = await customerRecipient(app.prisma, input);
    if (!recipient) return { queued: false };
    await sendEmail(app, { tenantId: input.tenantId, userId: recipient.userId, to: recipient.to, template: input.template, data: input.data });
    return { queued: true };
  } catch (err) {
    app.log.error({ err, tenantId: input.tenantId, template: input.template }, 'Failed to queue customer notification');
    return { queued: false };
  }
}
