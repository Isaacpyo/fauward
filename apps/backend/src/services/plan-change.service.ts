import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PlanChangeRequest } from '@prisma/client';
import { config } from '../config/index.js';
import { stripeService } from '../modules/payments/stripe.service.js';
import { planService } from '../modules/tenants/plan.service.js';
import { recordAndPublishActivity, staffActor } from './platform-activity.service.js';
import { notifyStaff, notifyTenantAdmins } from './platform-notifier.service.js';
import { BILLING_CYCLES, PAID_PLANS, applyPlanChange, stripePlanChangeAvailable, stripePriceFor, type BillingCycle, type PaidPlan } from './subscription.service.js';

// L6 plan change (WP-2.7). With Stripe (secret key + a price for the plan/cycle) the tenant goes through Checkout (no
// subscription yet) or a prorated subscription update; without it a PlanChangeRequest waits for staff approval.
// ENTERPRISE is always staff-approved (custom pricing).

type PlanApp = FastifyInstance;

export class PlanChangeError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const OPEN = ['PENDING', 'CHECKOUT_PENDING'];
const planWord = (plan: string) => `${plan.charAt(0)}${plan.slice(1).toLowerCase()}`;

export function presentPlanChangeRequest(row: PlanChangeRequest, tenant?: { id: string; name: string; slug: string } | null) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenant: tenant ?? null,
    fromPlan: row.fromPlan,
    toPlan: row.toPlan,
    billingCycle: row.billingCycle,
    status: row.status,
    channel: row.channel,
    requestedByUserId: row.requestedByUserId,
    decisionReason: row.decisionReason,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

/** What the tenant's BillingTab shows: plans with list prices, the current plan and any open request. */
export async function planChangeOptions(app: PlanApp, tenantId: string) {
  const [tenant, open] = await Promise.all([
    app.prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } }),
    app.prisma.planChangeRequest.findFirst({ where: { tenantId, status: { in: OPEN } }, orderBy: { createdAt: 'desc' } })
  ]);
  const latest = open ?? (await app.prisma.planChangeRequest.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } }));
  return {
    currentPlan: tenant?.subscription?.plan ?? tenant?.plan ?? null,
    billingCycle: tenant?.subscription?.billingCycle ?? 'MONTHLY',
    plans: PAID_PLANS.map((plan) => ({
      plan,
      price: planService.getPrice(plan),
      features: planService.getFeatures(plan),
      selfServe: plan !== 'ENTERPRISE' && BILLING_CYCLES.some((cycle) => stripePlanChangeAvailable(plan, cycle))
    })),
    request: latest ? presentPlanChangeRequest(latest) : null
  };
}

export async function requestPlanChange(app: PlanApp, request: FastifyRequest, input: { tenantId: string; userId: string; email: string | null; toPlan: string; billingCycle: string }) {
  if (!(PAID_PLANS as readonly string[]).includes(input.toPlan)) throw new PlanChangeError(400, 'UNKNOWN_PLAN', 'Choose Starter, Pro or Enterprise.');
  if (!(BILLING_CYCLES as readonly string[]).includes(input.billingCycle)) throw new PlanChangeError(400, 'UNKNOWN_CYCLE', 'Choose monthly or annual billing.');
  const toPlan = input.toPlan as PaidPlan;
  const cycle = input.billingCycle as BillingCycle;
  const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, include: { subscription: true } });
  if (!tenant) throw new PlanChangeError(404, 'NOT_FOUND', 'Tenant not found');
  const fromPlan = tenant.subscription?.plan ?? tenant.plan;
  if (fromPlan === toPlan && (tenant.subscription?.billingCycle ?? 'MONTHLY') === cycle) throw new PlanChangeError(409, 'SAME_PLAN', `You are already on ${planWord(toPlan)} (${cycle.toLowerCase()}).`);
  const tenantActor = { actorType: 'TENANT_USER' as const, actorId: input.userId, actorLabel: input.email ?? 'Tenant admin' };
  const activityDeps = { prisma: app.prisma, redis: app.redis, log: request.log };

  if (toPlan !== 'ENTERPRISE' && stripePlanChangeAvailable(toPlan, cycle)) {
    const priceId = stripePriceFor(toPlan, cycle)!;
    const stripeSubscriptionId = tenant.subscription?.stripeSubscriptionId;
    if (stripeSubscriptionId) {
      const row = await app.prisma.planChangeRequest.create({ data: { tenantId: tenant.id, fromPlan, toPlan, billingCycle: cycle, requestedByUserId: input.userId, status: 'APPROVED', channel: 'STRIPE_UPDATE' } });
      try {
        await stripeService.changeSubscriptionPrice({ subscriptionId: stripeSubscriptionId, priceId, metadata: { tenantId: tenant.id, planChangeRequestId: row.id, plan: toPlan, billingCycle: cycle }, idempotencyKey: `plan-change:${row.id}` });
      } catch (error) {
        request.log.error({ err: error, tenantId: tenant.id }, 'Stripe subscription update failed');
        await app.prisma.planChangeRequest.updateMany({ where: { id: row.id, tenantId: tenant.id }, data: { status: 'CANCELLED', decisionReason: 'Stripe update failed' } });
        throw new PlanChangeError(502, 'STRIPE_FAILED', 'Stripe could not change the subscription. Nothing was changed; try again or contact billing.');
      }
      await applyPlanChange(app, { tenantId: tenant.id, toPlan, billingCycle: cycle, source: 'TENANT', actor: tenantActor, planChangeRequestId: row.id });
      const applied = await app.prisma.planChangeRequest.findFirstOrThrow({ where: { id: row.id, tenantId: tenant.id } });
      return { kind: 'APPLIED' as const, request: presentPlanChangeRequest(applied) };
    }
    const row = await app.prisma.planChangeRequest.create({ data: { tenantId: tenant.id, fromPlan, toPlan, billingCycle: cycle, requestedByUserId: input.userId, status: 'CHECKOUT_PENDING', channel: 'STRIPE_CHECKOUT' } });
    try {
      const session = await stripeService.createSubscriptionCheckout({
        customerId: tenant.subscription?.stripeCustomerId,
        customerEmail: input.email,
        priceId,
        metadata: { tenantId: tenant.id, planChangeRequestId: row.id, plan: toPlan, billingCycle: cycle },
        successUrl: `${config.tenantPortalUrl}/settings?tab=billing&checkout=success`,
        cancelUrl: `${config.tenantPortalUrl}/settings?tab=billing&checkout=cancelled`,
        idempotencyKey: `plan-change:${row.id}`
      });
      await app.prisma.planChangeRequest.updateMany({ where: { id: row.id, tenantId: tenant.id }, data: { stripeCheckoutSessionId: session.sessionId } });
      return { kind: 'CHECKOUT' as const, redirectUrl: session.url, request: presentPlanChangeRequest({ ...row, stripeCheckoutSessionId: session.sessionId }) };
    } catch (error) {
      request.log.error({ err: error, tenantId: tenant.id }, 'Stripe checkout session failed');
      await app.prisma.planChangeRequest.updateMany({ where: { id: row.id, tenantId: tenant.id }, data: { status: 'CANCELLED', decisionReason: 'Stripe checkout could not start' } });
      throw new PlanChangeError(502, 'STRIPE_FAILED', 'Stripe checkout could not start. Nothing was changed; try again or contact billing.');
    }
  }

  const row = await app.prisma.$transaction(async (tx) => {
    const open = await tx.planChangeRequest.findFirst({ where: { tenantId: tenant.id, status: 'PENDING', channel: 'MANUAL_APPROVAL' } });
    if (open) return tx.planChangeRequest.update({ where: { id: open.id }, data: { toPlan, billingCycle: cycle, fromPlan, requestedByUserId: input.userId } });
    return tx.planChangeRequest.create({ data: { tenantId: tenant.id, fromPlan, toPlan, billingCycle: cycle, requestedByUserId: input.userId, status: 'PENDING', channel: 'MANUAL_APPROVAL' } });
  });
  await recordAndPublishActivity(activityDeps, {
    service: 'revenue.subscriptions',
    type: 'plan.change_requested',
    tenantId: tenant.id,
    ...tenantActor,
    subjectType: 'plan_change_request',
    subjectId: row.id,
    summary: `${tenant.name} asked to move from ${planWord(fromPlan)} to ${planWord(toPlan)} (${cycle.toLowerCase()})`,
    severity: 'ATTENTION',
    consoleLink: '/revenue/subscriptions/plan-change-requests'
  });
  await notifyStaff(app, {
    permission: 'revenue.subscriptions.write',
    event: 'plan.change_requested',
    title: `Plan change requested by ${tenant.name}`,
    body: `${planWord(fromPlan)} → ${planWord(toPlan)} (${cycle.toLowerCase()})`,
    link: '/revenue/subscriptions/plan-change-requests',
    severity: 'ATTENTION',
    tenantId: tenant.id
  });
  return { kind: 'REQUESTED' as const, request: presentPlanChangeRequest(row) };
}

/** Staff decision (dangerous route). APPROVE updates Stripe first when the tenant is Stripe-managed, then applies. */
export async function decidePlanChange(app: PlanApp, request: FastifyRequest, input: { id: string; decision: 'APPROVE' | 'REJECT'; reason: string }) {
  const row = await app.prisma.planChangeRequest.findUnique({ where: { id: input.id }, include: { tenant: { include: { subscription: true } } } });
  if (!row) throw new PlanChangeError(404, 'NOT_FOUND', 'Plan change request not found');
  if (row.status !== 'PENDING') throw new PlanChangeError(409, 'ALREADY_DECIDED', `This request is ${row.status.toLowerCase().replace(/_/g, ' ')}.`);
  if (!(PAID_PLANS as readonly string[]).includes(row.toPlan)) throw new PlanChangeError(400, 'UNKNOWN_PLAN', 'The requested plan is not one Fauward sells.');
  if (input.decision === 'APPROVE' && row.toPlan === 'ENTERPRISE') {
    const kyc = await app.prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { kycStatus: true } });
    if (kyc?.kycStatus !== 'APPROVED') throw new PlanChangeError(409, 'KYC_REQUIRED', 'ENTERPRISE needs an approved KYC review for this tenant (Trust → KYC).');
  }
  const staffId = request.platform!.user.id;
  const claimed = await app.prisma.planChangeRequest.updateMany({
    where: { id: row.id, tenantId: row.tenantId, status: 'PENDING' },
    data: { status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', decisionReason: input.reason, decidedByPlatformUserId: staffId, decidedAt: new Date() }
  });
  if (claimed.count !== 1) throw new PlanChangeError(409, 'ALREADY_DECIDED', 'This request was decided by someone else.');
  const tenant = { id: row.tenant.id, name: row.tenant.name, slug: row.tenant.slug };

  if (input.decision === 'REJECT') {
    await recordAndPublishActivity({ prisma: app.prisma, redis: app.redis, log: request.log }, {
      service: 'revenue.subscriptions',
      type: 'plan.change_rejected',
      tenantId: row.tenantId,
      ...staffActor(request),
      subjectType: 'plan_change_request',
      subjectId: row.id,
      summary: `${row.tenant.name}: move to ${planWord(row.toPlan)} rejected`,
      consoleLink: '/revenue/subscriptions/plan-change-requests',
      dedupeKey: `plan.change_rejected:${row.id}`
    });
    await notifyTenantAdmins(app, {
      tenantId: row.tenantId,
      event: 'plan.change_rejected',
      title: `Your move to ${planWord(row.toPlan)} was not approved`,
      body: input.reason,
      link: '/settings?tab=billing',
      email: { template: 'plan_change_request_decided', data: { decision: 'REJECTED', toPlan: planWord(row.toPlan), reason: input.reason } }
    });
  } else {
    const cycle: BillingCycle = row.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
    const stripeSubscriptionId = row.tenant.subscription?.stripeSubscriptionId;
    const priceId = stripePriceFor(row.toPlan, cycle);
    if (stripeSubscriptionId && priceId && stripeService.isConfigured()) {
      try {
        await stripeService.changeSubscriptionPrice({ subscriptionId: stripeSubscriptionId, priceId, metadata: { tenantId: row.tenantId, planChangeRequestId: row.id, plan: row.toPlan, billingCycle: cycle }, idempotencyKey: `plan-change:${row.id}:${randomUUID()}` });
      } catch (error) {
        request.log.error({ err: error, tenantId: row.tenantId }, 'Stripe subscription update failed on approval');
        await app.prisma.planChangeRequest.updateMany({ where: { id: row.id, tenantId: row.tenantId, status: 'APPROVED' }, data: { status: 'PENDING', decisionReason: null, decidedByPlatformUserId: null, decidedAt: null } });
        throw new PlanChangeError(502, 'STRIPE_FAILED', 'Stripe could not change the subscription; the request is still pending.');
      }
    }
    await applyPlanChange(app, { tenantId: row.tenantId, toPlan: row.toPlan as PaidPlan, billingCycle: cycle, source: 'CONSOLE', actor: staffActor(request), planChangeRequestId: row.id });
  }
  const after = await app.prisma.planChangeRequest.findFirstOrThrow({ where: { id: row.id, tenantId: row.tenantId } });
  return presentPlanChangeRequest(after, tenant);
}

/** Cancel at period end (dangerous route): Stripe stops renewing when it manages the subscription. */
export async function cancelSubscriptionAtPeriodEnd(app: PlanApp, request: FastifyRequest, input: { tenantId: string; reason: string }) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, include: { subscription: true } });
  if (!tenant?.subscription) throw new PlanChangeError(404, 'NO_SUBSCRIPTION', 'This tenant has no subscription.');
  if (tenant.subscription.cancelAtPeriodEnd) throw new PlanChangeError(409, 'ALREADY_CANCELLING', 'This subscription already ends at the period end.');
  let stripe = 'NOT_MANAGED';
  if (tenant.subscription.stripeSubscriptionId && stripeService.isConfigured()) {
    try {
      await stripeService.cancelSubscriptionAtPeriodEnd(tenant.subscription.stripeSubscriptionId);
      stripe = 'CANCELLED_AT_PERIOD_END';
    } catch (error) {
      request.log.error({ err: error, tenantId: tenant.id }, 'Stripe cancel failed');
      throw new PlanChangeError(502, 'STRIPE_FAILED', 'Stripe could not cancel the subscription; nothing changed.');
    }
  }
  await app.prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { tenantId: tenant.id }, data: { cancelAtPeriodEnd: true } });
    await tx.subscriptionEvent.create({ data: { tenantId: tenant.id, type: 'STATUS_CHANGED', fromStatus: tenant.subscription!.status, toStatus: 'CANCEL_AT_PERIOD_END', fromPlan: tenant.subscription!.plan, toPlan: tenant.subscription!.plan, source: 'CONSOLE' } });
  });
  await recordAndPublishActivity({ prisma: app.prisma, redis: app.redis, log: request.log }, {
    service: 'revenue.subscriptions',
    type: 'subscription.cancel_scheduled',
    tenantId: tenant.id,
    ...staffActor(request),
    subjectType: 'subscription',
    subjectId: tenant.id,
    summary: `${tenant.name}: subscription ends at the period end`,
    severity: 'ATTENTION',
    consoleLink: `/revenue/subscriptions/${tenant.id}`
  });
  await notifyTenantAdmins(app, {
    tenantId: tenant.id,
    event: 'subscription.cancel_scheduled',
    title: 'Your Fauward subscription will end',
    body: tenant.subscription.currentPeriodEnd ? `It stays active until ${tenant.subscription.currentPeriodEnd.toISOString().slice(0, 10)}.` : 'It stays active until the end of the current period.',
    link: '/settings?tab=billing'
  });
  return { stripe };
}
