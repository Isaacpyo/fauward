import type { FastifyInstance } from 'fastify';
import { domainService } from '../tenants/domain.service.js';
import { getActiveSuspensions, liftDunningSuspensionForInvoice, suspendTenant } from '../../services/tenant-suspension.service.js';
import { notifyTenantAdmins } from '../../services/platform-notifier.service.js';
import { DUNNING_SUSPEND_RULE } from '../../config/safety-rules.js';
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
      consoleLink: `/revenue/dunning/${input.tenantId}`,
      dedupeKey: `${input.eventType}:${input.invoiceRef}:${input.attempt}`
    }
  );
  return row;
}

/**
 * Stripe `invoice.payment_failed` (D3 caller 3): attempt 2 opens a DUNNING suspension for that Stripe invoice through
 * the suspension service; `invoice.paid` lifts it (handleDunningPaid). WP-4.5 replaces the attempt-2 suspend with the
 * dunning sequence.
 */
export async function handleDunningEvent(app: FastifyInstance, event: {
  tenantId: string;
  attempt: number;
  /** Stripe invoice id; becomes the suspension's sourceRef so the matching `invoice.paid` lifts it. */
  invoiceRef: string;
}) {
  const { tenantId, attempt } = event;
  const prisma = app.prisma;
  await recordStripeDunningEvent(app, { tenantId, eventType: 'payment_failed', attempt, invoiceRef: event.invoiceRef });

  if (attempt < DUNNING_SUSPEND_RULE.suspendOnAttempt) {
    await notifyTenantAdmins(app, {
      tenantId,
      event: 'billing.payment_failed',
      title: 'Your Fauward payment failed',
      body: 'Update your payment details in Settings → Billing. We will retry in 3 days.',
      link: '/settings?tab=billing',
      email: { template: 'billing_payment_failed', data: { invoiceRef: event.invoiceRef } }
    });
    return { tenantStatus: 'ACTIVE', retryInDays: 3 };
  }

  if (attempt === DUNNING_SUSPEND_RULE.suspendOnAttempt) {
    const result = await suspendTenant(app, {
      tenantId,
      source: 'DUNNING',
      category: 'BILLING',
      reason: `Stripe invoice ${event.invoiceRef}: payment attempt 2 failed`,
      actor: STRIPE_ACTOR,
      sourceRef: event.invoiceRef
    });
    return { tenantStatus: result.tenant.status, retryInDays: 4 };
  }

  if (attempt > DUNNING_SUSPEND_RULE.suspendOnAttempt) {
    await notifyTenantAdmins(app, {
      tenantId,
      event: 'billing.final_warning',
      title: 'Final notice: payment failed again',
      body: 'Your workspace stays suspended until the outstanding invoice is paid.',
      link: '/settings?tab=billing',
      email: { template: 'billing_final_warning', data: { invoiceRef: event.invoiceRef } }
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    // 30 days after the DUNNING cause opened (not since the tenant row last changed).
    const dunning = (await getActiveSuspensions(prisma, tenantId)).filter((record) => record.source === 'DUNNING');
    const since = dunning.length > 0 ? dunning[dunning.length - 1].createdAt : tenant?.suspendedAt ?? tenant?.updatedAt;
    if (tenant?.status === 'SUSPENDED' && since && since < new Date(Date.now() - DUNNING_SUSPEND_RULE.cancelAfterDays * 24 * 60 * 60 * 1000)) {
      await domainService.removeCustomDomain(prisma, {
        tenantId,
        actorUserId: null,
        actorIp: null,
        actorType: 'SYSTEM'
      });
      await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'CANCELLED' } });
      await notifyTenantAdmins(app, {
        tenantId,
        event: 'billing.account_cancelled',
        title: 'Your Fauward subscription was cancelled',
        body: 'The subscription was cancelled after repeated failed payments.',
        email: { template: 'billing_account_cancelled', data: { invoiceRef: event.invoiceRef } }
      });
      return { tenantStatus: 'CANCELLED', retryInDays: 0 };
    }

    return { tenantStatus: tenant?.status ?? 'ACTIVE', retryInDays: 0 };
  }

  return { tenantStatus: 'ACTIVE', retryInDays: 0 };
}

/** Stripe `invoice.paid`: lifts the DUNNING suspension opened for that invoice (via PAYMENT), if there is one. */
export async function handleDunningPaid(app: FastifyInstance, event: { tenantId: string; invoiceRef: string }) {
  await recordStripeDunningEvent(app, { tenantId: event.tenantId, eventType: 'payment_succeeded', attempt: 0, invoiceRef: event.invoiceRef });
  return liftDunningSuspensionForInvoice(app, { tenantId: event.tenantId, invoiceRef: event.invoiceRef, actor: STRIPE_ACTOR });
}
