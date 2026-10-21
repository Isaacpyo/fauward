import type { FastifyInstance } from 'fastify';
import { Prisma, type TenantPlan } from '@prisma/client';
import type Stripe from 'stripe';
import { config } from '../config/index.js';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';
import { mrrForSubscription } from './revenue/mrr.service.js';
import { invalidateTenantEntitlements } from './tenant-entitlements.service.js';
import { SYSTEM_ACTOR, recordAndPublishActivity, type ActivityInput } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';
import { createHandoffForConversion, isConversion } from './handoff.service.js';

// revenue.subscriptions (WP-2.7, L6): the one place a tenant's plan changes after signup. Tenant.plan and
// Subscription.plan move together, a SubscriptionEvent records the MRR before and after, and every API instance drops
// its cached entitlements (pub/sub). Callers: staff approval, a Stripe subscription update, the Stripe webhook.

export const PAID_PLANS = ['STARTER', 'PRO', 'ENTERPRISE'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export const BILLING_CYCLES = ['MONTHLY', 'ANNUAL'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export type SubscriptionEventSource = 'STRIPE_WEBHOOK' | 'CONSOLE' | 'TENANT' | 'SYSTEM' | 'BACKFILL';

type SubApp = FastifyInstance;

export function stripePriceFor(plan: string, cycle: string) {
  return config.stripe.prices[plan]?.[cycle];
}

export function planForStripePrice(priceId: string | null | undefined): { plan: PaidPlan; cycle: BillingCycle } | null {
  if (!priceId) return null;
  for (const plan of PAID_PLANS) {
    for (const cycle of BILLING_CYCLES) {
      if (config.stripe.prices[plan]?.[cycle] === priceId) return { plan, cycle };
    }
  }
  return null;
}

/** Stripe can change this tenant's plan: secret key + a price id for the target plan and cycle. */
export function stripePlanChangeAvailable(plan: string, cycle: string) {
  return Boolean(config.stripe.secretKey && stripePriceFor(plan, cycle));
}

function publishPlanChanged(app: SubApp, tenantId: string, plan: string) {
  invalidateTenantEntitlements(app.redis, tenantId).catch((err: unknown) => app.log.error({ err, tenantId }, 'Failed to invalidate entitlements'));
  app.redis
    .publish(`tenant:${tenantId}:plan-changed`, JSON.stringify({ tenantId, plan }))
    .catch((err: unknown) => app.log.error({ err, tenantId }, 'Failed to publish plan change'));
}

export type ApplyPlanChangeInput = {
  tenantId: string;
  toPlan: PaidPlan;
  billingCycle?: BillingCycle;
  source: SubscriptionEventSource;
  actor: Pick<ActivityInput, 'actorType' | 'actorId' | 'actorLabel'>;
  planChangeRequestId?: string | null;
  stripeEventId?: string | null;
  /** Extra Subscription columns written in the same transaction (Stripe ids, status, period). */
  subscription?: Prisma.SubscriptionUncheckedUpdateInput;
};

/** Applies a plan to Tenant + Subscription with a PLAN_CHANGED event; idempotent per Stripe event id. */
export async function applyPlanChange(app: SubApp, input: ApplyPlanChangeInput) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, include: { subscription: true } });
  if (!tenant) return null;
  if (input.stripeEventId && (await app.prisma.subscriptionEvent.findUnique({ where: { stripeEventId: input.stripeEventId } }))) return null;
  const fromPlan = tenant.subscription?.plan ?? tenant.plan;
  const cycle = input.billingCycle ?? (tenant.subscription?.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY');
  const before = await mrrForSubscription(app.prisma, tenant, tenant.subscription);
  const after = await mrrForSubscription(app.prisma, { ...tenant, plan: input.toPlan as TenantPlan }, { plan: input.toPlan, billingCycle: cycle, status: tenant.subscription?.status ?? 'ACTIVE' });

  const event = await app.prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenant.id }, data: { plan: input.toPlan as TenantPlan } });
    await tx.subscription.upsert({
      where: { tenantId: tenant.id },
      update: { plan: input.toPlan, billingCycle: cycle, ...(input.subscription ?? {}) },
      create: { tenantId: tenant.id, plan: input.toPlan, billingCycle: cycle, status: 'ACTIVE' }
    });
    if (input.planChangeRequestId) {
      await tx.planChangeRequest.updateMany({ where: { id: input.planChangeRequestId, tenantId: tenant.id, status: { in: ['PENDING', 'APPROVED', 'CHECKOUT_PENDING'] } }, data: { status: 'APPLIED', appliedAt: new Date() } });
    }
    return tx.subscriptionEvent.create({
      data: {
        tenantId: tenant.id,
        type: 'PLAN_CHANGED',
        fromPlan,
        toPlan: input.toPlan,
        mrrBefore: new Prisma.Decimal(before.amount),
        mrrAfter: new Prisma.Decimal(after.amount),
        currency: after.currency,
        source: input.source,
        stripeEventId: input.stripeEventId ?? null,
        planChangeRequestId: input.planChangeRequestId ?? null
      }
    });
  });

  publishPlanChanged(app, tenant.id, input.toPlan);
  // gtm.handoff (WP-4.17): a trial (or no subscription) becoming a paid ACTIVE one opens the sales → CS handoff.
  const statusAfter = typeof input.subscription?.status === 'string' ? input.subscription.status : tenant.subscription?.status ?? 'ACTIVE';
  if (isConversion(tenant.subscription?.status ?? null, statusAfter)) await createHandoffForConversion(app, { tenantId: tenant.id, subscriptionEventId: event.id });
  await recordAndPublishActivity(
    { prisma: app.prisma, redis: app.redis, log: app.log },
    {
      service: 'revenue.subscriptions',
      type: 'plan.changed',
      tenantId: tenant.id,
      ...input.actor,
      subjectType: 'subscription_event',
      subjectId: event.id,
      summary: `${tenant.name}: ${fromPlan} → ${input.toPlan} (MRR ${before.amount} → ${after.amount} ${after.currency})`,
      consoleLink: `/revenue/subscriptions/${tenant.id}`,
      dedupeKey: `plan.changed:${event.id}`,
      metadata: { fromPlan, toPlan: input.toPlan, source: input.source }
    }
  );
  await notifyTenantAdmins(app, {
    tenantId: tenant.id,
    event: 'plan.changed',
    title: `You are now on the ${input.toPlan.charAt(0)}${input.toPlan.slice(1).toLowerCase()} plan`,
    body: `Your plan changed from ${fromPlan.toLowerCase()} to ${input.toPlan.toLowerCase()}. New features are available now.`,
    link: '/settings?tab=billing',
    email: { template: 'plan_changed', data: { fromPlan, toPlan: input.toPlan } }
  });
  return { event, fromPlan, toPlan: input.toPlan };
}

const STRIPE_STATUS: Record<string, string> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  unpaid: 'PAST_DUE',
  canceled: 'CANCELLED',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'CANCELLED',
  paused: 'PAUSED'
};

function epoch(value: number | null | undefined) {
  return typeof value === 'number' ? new Date(value * 1000) : null;
}

async function tenantForStripeSubscription(app: SubApp, subscription: Stripe.Subscription) {
  const fromMetadata = subscription.metadata?.tenantId;
  if (fromMetadata) return fromMetadata;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const row = await app.prisma.subscription.findFirst({ where: { OR: [{ stripeSubscriptionId: subscription.id }, ...(customerId ? [{ stripeCustomerId: customerId }] : [])] }, select: { tenantId: true } });
  return row?.tenantId ?? null;
}

/** Tenant for a Stripe invoice: invoice metadata, the subscription's metadata, or the customer on file. */
export async function tenantForStripeInvoice(app: SubApp, invoice: Stripe.Invoice) {
  const direct = invoice.metadata?.tenantId || invoice.parent?.subscription_details?.metadata?.tenantId;
  if (direct) return direct;
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return null;
  const row = await app.prisma.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { tenantId: true } });
  return row?.tenantId ?? null;
}

/**
 * Stripe `customer.subscription.created|updated|deleted` and `checkout.session.completed` for a plan change
 * (ACC-SUB-2). Writes Subscription (ids, status, period), applies a plan change when the price maps to another plan,
 * and records a STATUS_CHANGED/CANCELLED event otherwise. A redelivered event changes nothing (stripeEventId).
 */
export async function handleStripeSubscriptionEvent(app: SubApp, event: Stripe.Event) {
  return runWithTenantContext(systemContext(), async () => {
    if (await app.prisma.subscriptionEvent.findUnique({ where: { stripeEventId: event.id } })) return { status: 'DUPLICATE' as const };
    const actor = { actorType: 'SYSTEM' as const, actorId: null, actorLabel: 'Stripe' };

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const requestId = session.metadata?.planChangeRequestId;
      const tenantId = session.metadata?.tenantId;
      if (!requestId || !tenantId) return { status: 'IGNORED' as const };
      const request = await app.prisma.planChangeRequest.findFirst({ where: { id: requestId, tenantId } });
      if (!request || !(PAID_PLANS as readonly string[]).includes(request.toPlan)) return { status: 'IGNORED' as const };
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
      await applyPlanChange(app, {
        tenantId,
        toPlan: request.toPlan as PaidPlan,
        billingCycle: request.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
        source: 'STRIPE_WEBHOOK',
        actor,
        planChangeRequestId: request.id,
        stripeEventId: event.id,
        subscription: { status: 'ACTIVE', ...(customerId ? { stripeCustomerId: customerId } : {}), ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}) }
      });
      return { status: 'APPLIED' as const };
    }

    if (!event.type.startsWith('customer.subscription.')) return { status: 'IGNORED' as const };
    const subscription = event.data.object as Stripe.Subscription;
    const tenantId = await tenantForStripeSubscription(app, subscription);
    if (!tenantId) return { status: 'UNKNOWN_TENANT' as const };
    const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
    if (!tenant) return { status: 'UNKNOWN_TENANT' as const };

    const item = subscription.items?.data?.[0];
    const mapped = planForStripePrice(item?.price?.id) ?? (subscription.metadata?.plan && (PAID_PLANS as readonly string[]).includes(subscription.metadata.plan) ? { plan: subscription.metadata.plan as PaidPlan, cycle: (subscription.metadata.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY') as BillingCycle } : null);
    const status = event.type === 'customer.subscription.deleted' ? 'CANCELLED' : STRIPE_STATUS[subscription.status] ?? subscription.status.toUpperCase();
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;
    const columns: Prisma.SubscriptionUncheckedUpdateInput = {
      stripeSubscriptionId: subscription.id,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      status,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodStart: epoch(item?.current_period_start),
      currentPeriodEnd: epoch(item?.current_period_end),
      trialEnd: epoch(subscription.trial_end),
      cancelledAt: status === 'CANCELLED' ? epoch(subscription.canceled_at) ?? new Date() : null
    };
    const currentPlan = tenant.subscription?.plan ?? tenant.plan;

    if (mapped && mapped.plan !== currentPlan) {
      await applyPlanChange(app, { tenantId, toPlan: mapped.plan, billingCycle: mapped.cycle, source: 'STRIPE_WEBHOOK', actor, stripeEventId: event.id, planChangeRequestId: subscription.metadata?.planChangeRequestId ?? null, subscription: columns });
      return { status: 'PLAN_CHANGED' as const };
    }

    const fromStatus = tenant.subscription?.status ?? null;
    const statusEvent = await app.prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { tenantId },
        update: columns,
        create: { tenantId, plan: currentPlan, billingCycle: mapped?.cycle ?? 'MONTHLY', status, stripeSubscriptionId: subscription.id, stripeCustomerId: customerId }
      });
      if (fromStatus === status) return null;
      return tx.subscriptionEvent.create({
        data: { tenantId, type: status === 'CANCELLED' ? 'CANCELLED' : 'STATUS_CHANGED', fromStatus, toStatus: status, fromPlan: currentPlan, toPlan: currentPlan, source: 'STRIPE_WEBHOOK', stripeEventId: event.id }
      });
    });
    if (statusEvent && isConversion(fromStatus, status)) await createHandoffForConversion(app, { tenantId, subscriptionEventId: statusEvent.id });
    if (fromStatus !== status) {
      await recordAndPublishActivity(
        { prisma: app.prisma, redis: app.redis, log: app.log },
        {
          service: 'revenue.subscriptions',
          type: 'subscription.status_changed',
          tenantId,
          ...SYSTEM_ACTOR,
          actorLabel: 'Stripe',
          subjectType: 'subscription',
          subjectId: tenantId,
          summary: `${tenant.name}: subscription ${(fromStatus ?? 'none').toLowerCase()} → ${status.toLowerCase()}`,
          severity: status === 'PAST_DUE' || status === 'CANCELLED' ? 'ATTENTION' : 'INFO',
          consoleLink: `/revenue/subscriptions/${tenantId}`,
          dedupeKey: `subscription.status_changed:${event.id}`
        }
      );
    }
    return { status: 'UPDATED' as const };
  });
}
