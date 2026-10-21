import type { FastifyInstance } from 'fastify';
import { liftDunningSuspensionForInvoice } from '../../services/tenant-suspension.service.js';
import { advanceEnrollment, enrollInvoice, recoverEnrollment } from '../../services/dunning.service.js';
import { SYSTEM_ACTOR, recordAndPublishActivity } from '../../services/platform-activity.service.js';

const STRIPE_ACTOR = { type: 'SYSTEM' as const, label: 'Stripe billing' };

/**
 * One DunningEvent per Stripe invoice and attempt (WP-2.7, ACC-L6-2) plus the payment.* activity; a redelivered
 * webhook finds the existing row and writes nothing.
 */
async function recordStripeDunningEvent(app: FastifyInstance, input: { tenantId: string; eventType: 'payment_failed' | 'payment_succeeded'; attempt: number; invoiceRef: string }) {
  const existing = await app.prisma.dunningEvent.findFirst({
    where: { tenantId: input.tenantId, eventType: input.eventType, attempt: input.attempt, metadata: { path: ['invoiceRef'], equals: input.invoiceRef } }
  });
  if (existing) return existing;
  const row = await app.prisma.dunningEvent.create({ data: { tenantId: input.tenantId, eventType: input.eventType, attempt: input.attempt, metadata: { invoiceRef: input.invoiceRef, source: 'stripe' } } });
  const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { name: true } });
  await recordAndPublishActivity(
    { prisma: app.prisma, redis: app.redis, log: app.log },
    {
      service: 'revenue.dunning',
      type: input.eventType === 'payment_failed' ? 'payment.failed' : 'payment.succeeded',
      tenantId: input.tenantId,
      ...SYSTEM_ACTOR,
      actorLabel: 'Stripe',
      subjectType: 'dunning_event',
      subjectId: row.id,
      summary: input.eventType === 'payment_failed' ? `${tenant?.name ?? input.tenantId}: Fauward payment failed (attempt ${input.attempt})` : `${tenant?.name ?? input.tenantId}: Fauward invoice paid`,
      severity: input.eventType === 'payment_failed' ? 'ATTENTION' : 'INFO',
      consoleLink: `/revenue/dunning/tenants/${input.tenantId}`,
      dedupeKey: `${input.eventType}:${input.invoiceRef}:${input.attempt}`
    }
  );
  return row;
}

/**
 * Stripe `invoice.payment_failed`: records the DunningEvent and enrols the invoice on the default dunning sequence
 * (WP-4.5). The sequence decides what happens next — emails, retries and, at its SUSPEND step, the D3 suspension; a
 * redelivered webhook or a later attempt for the same invoice keeps the one enrolment.
 */
export async function handleDunningEvent(app: FastifyInstance, event: {
  tenantId: string;
  attempt: number;
  /** Stripe invoice id; the enrolment and any suspension it opens are keyed by it, so `invoice.paid` ends both. */
  invoiceRef: string;
}) {
  await recordStripeDunningEvent(app, { tenantId: event.tenantId, eventType: 'payment_failed', attempt: event.attempt, invoiceRef: event.invoiceRef });
  const { enrollment, created } = await enrollInvoice(app, { tenantId: event.tenantId, invoiceId: event.invoiceRef, source: 'STRIPE', trigger: `invoice.payment_failed (attempt ${event.attempt})` });
  // Day 0 runs now rather than at the next hourly sweep.
  if (created) await advanceEnrollment(app, enrollment.id);
  return { enrollmentId: enrollment.id, created };
}

/** Stripe `invoice.paid`: lifts the DUNNING suspension opened for that invoice (via PAYMENT), if there is one. */
export async function handleDunningPaid(app: FastifyInstance, event: { tenantId: string; invoiceRef: string }) {
  await recordStripeDunningEvent(app, { tenantId: event.tenantId, eventType: 'payment_succeeded', attempt: 0, invoiceRef: event.invoiceRef });
  await recoverEnrollment(app, { tenantId: event.tenantId, invoiceRefs: [event.invoiceRef], via: 'Stripe invoice.paid' });
  return liftDunningSuspensionForInvoice(app, { tenantId: event.tenantId, invoiceRef: event.invoiceRef, actor: STRIPE_ACTOR });
}
