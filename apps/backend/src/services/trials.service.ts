import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type TrialExtensionRequest } from '@prisma/client';
import { z } from 'zod';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { recordAndPublishActivity } from './platform-activity.service.js';
import { notifyStaff, notifyTenantAdmins } from './platform-notifier.service.js';
import { stripeAdapter } from './vendors/stripe.adapter.js';
import { ACTIVATION_THRESHOLD } from '../config/activation.js';

// gtm.trials (WP-4.14). Trials are tenants whose Subscription is TRIALING (DEMO tenants excluded). A tenant admin asks
// for more time from the trial banner (≤ 14 days, one pending request per tenant, enforced by the unique
// `pendingTenantId`). Staff approve or deny it, or extend a trial proactively. Approval moves Subscription.trialEnd,
// writes SubscriptionEvent TRIAL_EXTENDED, mirrors Stripe `trial_end` when Stripe manages the subscription, and tells
// the tenant admins. Over 7 days needs a sales manager, over 30 days a sales director (thresholds kept from the
// pre-WP-4.14 approve route).

const SERVICE = 'gtm.trials';
const DAY_MS = 24 * 60 * 60 * 1000;
export const TENANT_MAX_DAYS = 14;
export const CONSOLE_MAX_DAYS = 90;
const MANAGER_DAYS = 7;
const DIRECTOR_DAYS = 30;
const EXPIRING_DAYS = 7;
const LIST_LIMIT = 500;
const BILLING_LINK = '/settings?tab=billing';
const THRESHOLDS = { managerOver: MANAGER_DAYS, directorOver: DIRECTOR_DAYS, consoleMax: CONSOLE_MAX_DAYS, tenantMax: TENANT_MAX_DAYS };

export class TrialError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function daysLeft(trialEnd: Date | null, now: Date) {
  return trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / DAY_MS)) : null;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function presentRequest(row: TrialExtensionRequest) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    requestedDays: row.requestedDays,
    status: row.status,
    source: row.source,
    reason: row.reason,
    requestedBy: row.requestedBy,
    decidedBy: row.decidedBy,
    decidedAt: iso(row.decidedAt),
    decisionReason: row.decisionReason,
    previousTrialEnd: iso(row.previousTrialEnd),
    newTrialEnd: iso(row.newTrialEnd),
    stripeSync: row.stripeSync,
    createdAt: row.createdAt.toISOString()
  };
}

// ── Console: lists ───────────────────────────────────────────────────────────

export const trialListQuery = z.object({ lowActivation: z.enum(['true', 'false']).optional() });
export const extensionListQuery = z.object({ status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'ALL']).default('PENDING') });

const trialTenantSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  subscription: { select: { status: true, plan: true, trialEnd: true, stripeSubscriptionId: true } }
} satisfies Prisma.TenantSelect;

type TrialTenant = Prisma.TenantGetPayload<{ select: typeof trialTenantSelect }>;

async function presentTrials(app: Pick<FastifyInstance, 'prisma'>, tenants: TrialTenant[], now: Date) {
  const ids = tenants.map((tenant) => tenant.id);
  const [activations, pending] = ids.length
    ? await Promise.all([
        app.prisma.trialActivation.findMany({ where: { tenantId: { in: ids } } }),
        app.prisma.trialExtensionRequest.findMany({ where: { tenantId: { in: ids }, pendingTenantId: { in: ids } } })
      ])
    : [[], []];
  const activationBy = new Map(activations.map((row) => [row.tenantId, row]));
  const pendingBy = new Map(pending.map((row) => [row.tenantId, row]));
  return tenants.map((tenant) => {
    const activation = activationBy.get(tenant.id);
    const request = pendingBy.get(tenant.id);
    const trialEnd = tenant.subscription?.trialEnd ?? null;
    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status },
      plan: tenant.subscription?.plan ?? null,
      subscriptionStatus: tenant.subscription?.status ?? null,
      trialEnd: iso(trialEnd),
      daysLeft: daysLeft(trialEnd, now),
      activation: activation
        ? {
            score: activation.score,
            firstShipmentCreated: activation.firstShipmentCreated,
            teamInvited: activation.teamInvited,
            paymentMethodConnected: activation.paymentMethodConnected,
            webhookConfigured: activation.webhookConfigured,
            customDomainSet: activation.customDomainSet,
            interventionStatus: activation.interventionStatus,
            scoredAt: activation.updatedAt.toISOString()
          }
        : null,
      pendingRequest: request ? { id: request.id, requestedDays: request.requestedDays, createdAt: request.createdAt.toISOString() } : null
    };
  });
}

function byTrialEnd(a: TrialTenant, b: TrialTenant) {
  const left = a.subscription?.trialEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  const right = b.subscription?.trialEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  return left - right;
}

export async function listTrials(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof trialListQuery>, now = new Date()) {
  const tenants = await app.prisma.tenant.findMany({
    where: { status: { not: 'DEMO' }, OR: [{ status: 'TRIALING' }, { subscription: { status: 'TRIALING' } }] },
    select: trialTenantSelect,
    take: LIST_LIMIT + 1
  });
  const truncated = tenants.length > LIST_LIMIT;
  let rows = await presentTrials(app, tenants.slice(0, LIST_LIMIT).sort(byTrialEnd), now);
  if (query.lowActivation === 'true') rows = rows.filter((row) => row.activation !== null && row.activation.score < ACTIVATION_THRESHOLD);
  return { data: rows, truncated, activationThreshold: ACTIVATION_THRESHOLD };
}

export async function listExpiring(app: Pick<FastifyInstance, 'prisma'>, now = new Date()) {
  const tenants = await app.prisma.tenant.findMany({
    where: { status: { not: 'DEMO' }, subscription: { status: 'TRIALING', trialEnd: { gte: now, lte: new Date(now.getTime() + EXPIRING_DAYS * DAY_MS) } } },
    select: trialTenantSelect,
    take: LIST_LIMIT
  });
  return { data: await presentTrials(app, tenants.sort(byTrialEnd), now), windowDays: EXPIRING_DAYS };
}

export async function trialDetail(app: Pick<FastifyInstance, 'prisma'>, tenantId: string, now = new Date()) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: trialTenantSelect });
  if (!tenant) throw new TrialError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  const [[row], requests, events] = await Promise.all([
    presentTrials(app, [tenant], now),
    app.prisma.trialExtensionRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    app.prisma.subscriptionEvent.findMany({ where: { tenantId, type: 'TRIAL_EXTENDED' }, orderBy: { occurredAt: 'desc' }, take: 20 })
  ]);
  return {
    ...row,
    managedByStripe: Boolean(tenant.subscription?.stripeSubscriptionId),
    thresholds: THRESHOLDS,
    requests: requests.map(presentRequest),
    events: events.map((event) => ({ id: event.id, source: event.source, occurredAt: event.occurredAt.toISOString() }))
  };
}

export async function listExtensions(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof extensionListQuery>, now = new Date()) {
  const rows = await app.prisma.trialExtensionRequest.findMany({
    where: query.status === 'ALL' ? {} : { status: query.status },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  const tenantIds = [...new Set(rows.map((row) => row.tenantId))];
  const tenants = tenantIds.length ? await app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: trialTenantSelect }) : [];
  const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  return {
    data: rows.map((row) => {
      const tenant = byId.get(row.tenantId);
      const trialEnd = tenant?.subscription?.trialEnd ?? null;
      return {
        ...presentRequest(row),
        tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : { id: row.tenantId, name: row.tenantId, slug: null },
        currentTrialEnd: iso(trialEnd),
        currentDaysLeft: daysLeft(trialEnd, now),
        subscriptionStatus: tenant?.subscription?.status ?? null
      };
    }),
    thresholds: THRESHOLDS
  };
}

// ── Console: decisions ───────────────────────────────────────────────────────

export const decisionBody = z.object({ decision: z.enum(['APPROVE', 'DENY']), reason: z.string().trim().min(8).max(1000) });
export const extendBody = z.object({ days: z.coerce.number().int().min(1).max(CONSOLE_MAX_DAYS), reason: z.string().trim().min(8).max(1000) });

function assertDaysAllowed(request: FastifyRequest, days: number) {
  const roles = new Set<string>(request.console?.roles ?? []);
  const director = roles.has('ROOT') || roles.has('SALES_DIRECTOR');
  const manager = director || roles.has('SALES_MANAGER');
  if (days > DIRECTOR_DAYS && !director) throw new TrialError(403, 'SALES_DIRECTOR_REQUIRED', `Extensions over ${DIRECTOR_DAYS} days need a sales director.`);
  if (days > MANAGER_DAYS && !manager) throw new TrialError(403, 'SALES_MANAGER_REQUIRED', `Extensions over ${MANAGER_DAYS} days need a sales manager.`);
}

type StripeSync = 'MIRRORED' | 'NOT_CONFIGURED' | 'NO_STRIPE_SUBSCRIPTION' | 'FAILED';

/** Moves trialEnd inside the caller's transaction. A trial end already in the past counts from now. */
async function moveTrialEnd(tx: Prisma.TransactionClient, tenantId: string, days: number, now: Date) {
  const subscription = await tx.subscription.findUnique({ where: { tenantId }, select: { status: true, plan: true, trialEnd: true, stripeSubscriptionId: true } });
  if (!subscription || subscription.status !== 'TRIALING') throw new TrialError(409, 'NOT_TRIALING', 'This tenant is not on a trial.');
  const previous = subscription.trialEnd;
  const base = previous && previous > now ? previous : now;
  const next = new Date(base.getTime() + days * DAY_MS);
  const moved = await tx.subscription.updateMany({ where: { tenantId, status: 'TRIALING' }, data: { trialEnd: next } });
  if (moved.count !== 1) throw new TrialError(409, 'NOT_TRIALING', 'The subscription changed; reload and try again.');
  await tx.subscriptionEvent.create({ data: { tenantId, type: 'TRIAL_EXTENDED', fromPlan: subscription.plan, toPlan: subscription.plan, fromStatus: 'TRIALING', toStatus: 'TRIALING', source: 'CONSOLE' } });
  return { previous, next, stripeSubscriptionId: subscription.stripeSubscriptionId };
}

async function mirrorTrialEnd(app: Pick<FastifyInstance, 'prisma' | 'log'>, input: { requestId: string; tenantId: string; stripeSubscriptionId: string | null; trialEnd: Date }): Promise<StripeSync> {
  let sync: StripeSync;
  if (!stripeAdapter.isConfigured()) sync = 'NOT_CONFIGURED';
  else if (!input.stripeSubscriptionId) sync = 'NO_STRIPE_SUBSCRIPTION';
  else {
    try {
      await stripeAdapter.setTrialEnd(input.stripeSubscriptionId, input.trialEnd, `trial-extension:${input.requestId}`);
      sync = 'MIRRORED';
    } catch (error) {
      app.log.error({ err: error, tenantId: input.tenantId, requestId: input.requestId }, 'Stripe trial_end mirror failed');
      sync = 'FAILED';
    }
  }
  await app.prisma.trialExtensionRequest.updateMany({ where: { id: input.requestId, tenantId: input.tenantId }, data: { stripeSync: sync } });
  return sync;
}

function formatDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function tellTenant(app: FastifyInstance, tenantId: string, approved: boolean, summary: string) {
  await notifyTenantAdmins(app, {
    tenantId,
    event: approved ? 'trial.extension_approved' : 'trial.extension_denied',
    title: approved ? 'Your trial has been extended' : 'Your trial extension request was declined',
    body: summary,
    link: BILLING_LINK,
    email: { template: 'trial_extension_decided', data: { decision: approved ? 'Approved' : 'Declined', summary } }
  });
}

export async function decideExtension(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof decisionBody>, now = new Date()) {
  const row = await app.prisma.trialExtensionRequest.findUnique({ where: { id } });
  if (!row) throw new TrialError(404, 'REQUEST_NOT_FOUND', 'Extension request not found');
  if (row.status !== 'PENDING') throw new TrialError(409, 'ALREADY_DECIDED', `This request is already ${row.status.toLowerCase()}.`);
  const approve = body.decision === 'APPROVE';
  if (approve) assertDaysAllowed(request, row.requestedDays);
  const tenant = await app.prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { name: true } });
  const tenantName = tenant?.name ?? row.tenantId;
  const staffId = request.platform!.user.id;

  const outcome = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const moved = approve ? await moveTrialEnd(tx, row.tenantId, row.requestedDays, now) : null;
    const status = approve ? 'APPROVED' : 'DENIED';
    const claimed = await tx.trialExtensionRequest.updateMany({
      where: { id, tenantId: row.tenantId, status: 'PENDING' },
      data: {
        status,
        pendingTenantId: null,
        decidedBy: staffId,
        decidedAt: now,
        decisionReason: body.reason,
        ...(moved ? { approvedBy: staffId, previousTrialEnd: moved.previous, newTrialEnd: moved.next } : {})
      }
    });
    if (claimed.count !== 1) throw new TrialError(409, 'ALREADY_DECIDED', 'The request changed; reload and try again.');
    return {
      result: moved,
      audit: {
        action: `TRIAL_EXTENSION_${status}`,
        targetTenantId: row.tenantId,
        reason: body.reason,
        metadata: { requestId: id, requestedDays: row.requestedDays, previousTrialEnd: iso(moved?.previous), newTrialEnd: iso(moved?.next) }
      },
      activity: {
        type: `trials.extension_${status.toLowerCase()}`,
        tenantId: row.tenantId,
        subjectType: 'trial_extension',
        subjectId: id,
        summary: approve ? `${tenantName}: trial extended by ${row.requestedDays} days` : `${tenantName}: trial extension declined`,
        consoleLink: `/gtm/trials/${row.tenantId}`
      }
    };
  });

  let stripeSync: StripeSync | null = null;
  if (outcome) {
    stripeSync = await mirrorTrialEnd(app, { requestId: id, tenantId: row.tenantId, stripeSubscriptionId: outcome.stripeSubscriptionId, trialEnd: outcome.next });
    await tellTenant(app, row.tenantId, true, `Your trial now ends on ${formatDay(outcome.next)} (${row.requestedDays} more days).`);
  } else {
    await tellTenant(app, row.tenantId, false, `Reason: ${body.reason}`);
  }
  const updated = await app.prisma.trialExtensionRequest.findUniqueOrThrow({ where: { id } });
  return { request: presentRequest(updated), stripeSync };
}

export async function extendTrial(app: FastifyInstance, request: FastifyRequest, tenantId: string, body: z.infer<typeof extendBody>, now = new Date()) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, status: true } });
  if (!tenant) throw new TrialError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  if (tenant.status === 'DEMO') throw new TrialError(409, 'DEMO_TENANT', 'Demo tenants have no trial to extend.');
  assertDaysAllowed(request, body.days);
  const staffId = request.platform!.user.id;

  const { row, moved } = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const change = await moveTrialEnd(tx, tenantId, body.days, now);
    const created = await tx.trialExtensionRequest.create({
      data: {
        tenantId,
        requestedDays: body.days,
        status: 'APPROVED',
        source: 'CONSOLE',
        requestedBy: staffId,
        approvedBy: staffId,
        reason: body.reason,
        decidedBy: staffId,
        decidedAt: now,
        decisionReason: body.reason,
        previousTrialEnd: change.previous,
        newTrialEnd: change.next
      }
    });
    return {
      result: { row: created, moved: change },
      audit: { action: 'TRIAL_EXTENDED', targetTenantId: tenantId, reason: body.reason, metadata: { requestId: created.id, days: body.days, previousTrialEnd: iso(change.previous), newTrialEnd: change.next.toISOString() } },
      activity: { type: 'trials.extended', tenantId, subjectType: 'trial_extension', subjectId: created.id, summary: `${tenant.name}: trial extended by ${body.days} days`, consoleLink: `/gtm/trials/${tenantId}` }
    };
  });

  const stripeSync = await mirrorTrialEnd(app, { requestId: row.id, tenantId, stripeSubscriptionId: moved.stripeSubscriptionId, trialEnd: moved.next });
  await tellTenant(app, tenantId, true, `Your trial now ends on ${formatDay(moved.next)} (${body.days} more days).`);
  const updated = await app.prisma.trialExtensionRequest.findUniqueOrThrow({ where: { id: row.id } });
  return { request: presentRequest(updated), stripeSync };
}

// ── Tenant side ──────────────────────────────────────────────────────────────

export const tenantRequestBody = z.object({
  days: z.coerce.number().int().min(1).max(TENANT_MAX_DAYS, `You can ask for up to ${TENANT_MAX_DAYS} days.`),
  reason: z.string().trim().min(10, 'Tell us briefly why you need more time.').max(1000)
});

export async function tenantTrialStatus(app: Pick<FastifyInstance, 'prisma'>, tenantId: string, now = new Date()) {
  const [subscription, latest] = await Promise.all([
    app.prisma.subscription.findUnique({ where: { tenantId }, select: { status: true, trialEnd: true } }),
    app.prisma.trialExtensionRequest.findFirst({ where: { tenantId, source: 'TENANT' }, orderBy: { createdAt: 'desc' } })
  ]);
  const trialing = subscription?.status === 'TRIALING';
  const pending = latest?.status === 'PENDING';
  return {
    trialing,
    trialEnd: trialing ? iso(subscription?.trialEnd) : null,
    daysRemaining: trialing ? daysLeft(subscription?.trialEnd ?? null, now) : null,
    canRequest: trialing && !pending,
    maxDays: TENANT_MAX_DAYS,
    latestRequest: latest
      ? {
          id: latest.id,
          status: latest.status,
          requestedDays: latest.requestedDays,
          createdAt: latest.createdAt.toISOString(),
          decidedAt: iso(latest.decidedAt),
          decisionReason: latest.status === 'DENIED' ? latest.decisionReason : null,
          newTrialEnd: iso(latest.newTrialEnd)
        }
      : null
  };
}

export async function requestExtension(app: FastifyInstance, request: FastifyRequest, input: { tenantId: string; userId: string; body: z.infer<typeof tenantRequestBody> }) {
  const [tenant, subscription] = await Promise.all([
    app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { name: true, status: true } }),
    app.prisma.subscription.findUnique({ where: { tenantId: input.tenantId }, select: { status: true } })
  ]);
  if (!tenant) throw new TrialError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  if (tenant.status === 'DEMO' || subscription?.status !== 'TRIALING') throw new TrialError(409, 'NOT_TRIALING', 'Your workspace is not on a trial.');

  let row: TrialExtensionRequest;
  try {
    row = await app.prisma.trialExtensionRequest.create({
      data: { tenantId: input.tenantId, pendingTenantId: input.tenantId, requestedDays: input.body.days, status: 'PENDING', source: 'TENANT', requestedBy: input.userId, reason: input.body.reason }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new TrialError(409, 'ALREADY_PENDING', 'A request for more time is already waiting for a decision.');
    throw error;
  }
  await recordAndPublishActivity(app, {
    service: SERVICE,
    type: 'trials.extension_requested',
    tenantId: input.tenantId,
    actorType: 'TENANT_USER',
    actorId: input.userId,
    actorLabel: request.user?.email ?? 'Tenant user',
    subjectType: 'trial_extension',
    subjectId: row.id,
    summary: `${tenant.name} asked for ${row.requestedDays} more trial days`,
    severity: 'ATTENTION',
    consoleLink: '/gtm/trials/extensions',
    dedupeKey: `trials.extension_requested:${row.id}`
  });
  await notifyStaff(app, { permission: 'gtm.trials.extend', event: 'trials.extension_requested', title: `${tenant.name} asked for ${row.requestedDays} more trial days`, link: '/gtm/trials/extensions', severity: 'ATTENTION', tenantId: input.tenantId });
  return tenantTrialStatus(app, input.tenantId);
}
