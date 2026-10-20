import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { stripeService } from '../modules/payments/stripe.service.js';
import { activeLegalHoldForTenant } from './legal-hold.service.js';
import { writePlatformAuditLog } from './platform-audit.service.js';
import { publishActivity, recordActivity } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';
import { suspendTenant, type SuspensionActor } from './tenant-suspension.service.js';
import { invalidateTenantEntitlements } from './tenant-entitlements.service.js';

// Close a tenant (WP-1.2; replaces "delete"). Nothing is purged here: purge needs its own ADR and owner approval.

export const TENANT_CLOSED_PUBLIC_REASON = 'This workspace has been closed by Fauward.';

export class TenantCloseError extends Error {
  constructor(
    readonly code: 'TENANT_NOT_FOUND' | 'SLUG_MISMATCH' | 'TENANT_ALREADY_CLOSED' | 'LEGAL_HOLD_ACTIVE',
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export type StripeCancelOutcome =
  | { status: 'CANCEL_AT_PERIOD_END'; subscriptionId: string }
  | { status: 'NOT_CONFIGURED' | 'NO_SUBSCRIPTION'; message: string }
  | { status: 'FAILED'; subscriptionId: string; message: string };

type StaffActor = Extract<SuspensionActor, { type: 'STAFF' }>;

/**
 * Closes a tenant: status CANCELLED, closedAt, purgeAfter = closedAt + retention, a PLATFORM/OTHER suspension cause,
 * Stripe subscription set to cancel at period end when Stripe is configured, tenant admins notified. Blocked by an
 * active legal hold. A closed tenant is never reactivated (D3).
 */
export async function closeTenant(app: FastifyInstance, input: { tenantId: string; reason: string; confirmSlug: string; actor: StaffActor }) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, include: { subscription: true } });
  if (!tenant) throw new TenantCloseError('TENANT_NOT_FOUND', 404, 'Tenant not found');
  if (input.confirmSlug.trim().toLowerCase() !== tenant.slug.toLowerCase()) {
    throw new TenantCloseError('SLUG_MISMATCH', 400, 'Type the tenant slug exactly to confirm closing it.');
  }
  if (tenant.closedAt) throw new TenantCloseError('TENANT_ALREADY_CLOSED', 409, 'This tenant is already closed.');
  const hold = await activeLegalHoldForTenant(app.prisma, tenant.id);
  if (hold) throw new TenantCloseError('LEGAL_HOLD_ACTIVE', 409, `A legal hold applies to this tenant: ${hold.reason}`);

  const closedAt = new Date();
  const purgeAfter = new Date(closedAt.getTime() + config.tenants.closeRetentionDays * 24 * 60 * 60 * 1000);
  const { closed, activity } = await app.prisma.$transaction(async (tx) => {
    const closed = await tx.tenant.update({
      where: { id: tenant.id },
      data: { status: 'CANCELLED', closedAt, closedReason: input.reason, purgeAfter }
    });
    await writePlatformAuditLog(tx, {
      actorType: 'PLATFORM_USER',
      actorId: input.actor.platformUserId,
      actorEmail: input.actor.email,
      action: 'TENANT_CLOSED',
      targetTenantId: tenant.id,
      reason: input.reason,
      metadata: { previousStatus: tenant.status, purgeAfter: purgeAfter.toISOString(), retentionDays: config.tenants.closeRetentionDays },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null
    });
    const activity = await recordActivity(tx, {
      service: 'platform.tenants',
      type: 'tenant.closed',
      tenantId: tenant.id,
      actorType: 'STAFF',
      actorId: input.actor.platformUserId,
      actorLabel: input.actor.label,
      subjectType: 'tenant',
      subjectId: tenant.id,
      summary: `${tenant.name} closed; data kept until ${purgeAfter.toISOString().slice(0, 10)}`,
      severity: 'CRITICAL',
      consoleLink: `/platform/tenants/${tenant.id}`,
      dedupeKey: `tenant.closed:${tenant.id}`
    });
    return { closed, activity };
  });
  publishActivity(app.redis, activity, app.log);

  // The closure is also a suspension cause, so every console view of suspensions shows it (D3). The tenant is already
  // closed, so this neither changes its status nor sends a "suspended" notice.
  const suspension = await suspendTenant(app, {
    tenantId: tenant.id,
    source: 'PLATFORM',
    category: 'OTHER',
    reason: `Tenant closed: ${input.reason}`,
    publicReason: TENANT_CLOSED_PUBLIC_REASON,
    actor: input.actor,
    sourceRef: `close:${tenant.id}`
  });

  let stripe: StripeCancelOutcome;
  const subscriptionId = tenant.subscription?.stripeSubscriptionId;
  if (!stripeService.isConfigured()) {
    stripe = { status: 'NOT_CONFIGURED', message: 'Stripe is not configured: no Stripe subscription to cancel.' };
  } else if (!subscriptionId) {
    stripe = { status: 'NO_SUBSCRIPTION', message: 'No Stripe subscription to cancel.' };
  } else {
    try {
      await stripeService.cancelSubscriptionAtPeriodEnd(subscriptionId);
      await app.prisma.subscription.update({ where: { tenantId: tenant.id }, data: { cancelAtPeriodEnd: true } });
      stripe = { status: 'CANCEL_AT_PERIOD_END', subscriptionId };
    } catch (err) {
      app.log.error({ err, tenantId: tenant.id }, 'Stripe cancel-at-period-end failed during tenant close');
      stripe = { status: 'FAILED', subscriptionId, message: err instanceof Error ? err.message : 'Stripe request failed' };
    }
  }

  invalidateTenantEntitlements(app.redis, tenant.id).catch((err: unknown) => app.log.error({ err, tenantId: tenant.id }, 'Failed to invalidate entitlements'));
  await notifyTenantAdmins(app, {
    tenantId: tenant.id,
    event: 'tenant.closed',
    title: 'Your workspace has been closed',
    body: TENANT_CLOSED_PUBLIC_REASON,
    email: { template: 'tenant_closed', data: { tenantName: tenant.name, purgeAfter: purgeAfter.toISOString() } }
  });

  return { tenant: closed, suspension: suspension.record, stripe, purgeAfter };
}
