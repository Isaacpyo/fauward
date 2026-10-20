import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient, SuspensionRecord, Tenant } from '@prisma/client';
import { writePlatformAuditLog } from './platform-audit.service.js';
import { publishActivity, recordActivity, type ActivityActorType } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';

// TenantSuspensionService (D3): the only code that may set Tenant.status = 'SUSPENDED' or lift it. Each cause is one
// SuspensionRecord; the tenant is ACTIVE again only when no ACTIVE record remains. single-suspension-path.test.ts
// fails the build if anything else writes the status.

export const SUSPENSION_SOURCES = ['PLATFORM', 'DUNNING', 'FRAUD', 'AUP', 'LEGAL', 'SYSTEM'] as const;
export const SUSPENSION_CATEGORIES = ['BILLING', 'FRAUD', 'AUP', 'SECURITY', 'LEGAL', 'OTHER'] as const;
export const LIFT_VIAS = ['MANUAL', 'APPEAL', 'PAYMENT', 'EXPIRY'] as const;
export type SuspensionSource = (typeof SUSPENSION_SOURCES)[number];
export type SuspensionCategory = (typeof SUSPENSION_CATEGORIES)[number];
export type LiftVia = (typeof LIFT_VIAS)[number];

/** Shown to the tenant when staff give no public reason. Never contains the internal reason. */
export const DEFAULT_PUBLIC_REASONS: Record<SuspensionCategory, string> = {
  BILLING: 'Your workspace is suspended because a payment to Fauward failed. Update your payment method to restore access.',
  FRAUD: 'Your workspace is suspended while Fauward reviews account activity.',
  AUP: 'Your workspace is suspended for a breach of the Fauward acceptable use policy.',
  SECURITY: 'Your workspace is suspended to protect it while Fauward investigates a security concern.',
  LEGAL: 'Your workspace is suspended for a legal or compliance reason.',
  OTHER: 'Your workspace is suspended. Contact Fauward support for details.'
};

export type SuspensionActor =
  | { type: 'STAFF'; platformUserId: string; email: string; label: string; ipAddress?: string | null; userAgent?: string | null }
  | { type: 'SYSTEM'; label: string };

export class SuspensionError extends Error {
  constructor(
    readonly code: 'TENANT_NOT_FOUND' | 'SUSPENSION_NOT_FOUND' | 'SUSPENSION_NOT_ACTIVE' | 'NO_ACTIVE_SUSPENSION',
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

type SuspensionDb = PrismaClient | Prisma.TransactionClient;
export type SuspensionApp = FastifyInstance;

function actorColumns(actor: SuspensionActor) {
  return actor.type === 'STAFF'
    ? { actorType: 'PLATFORM_USER' as const, actorId: actor.platformUserId, actorEmail: actor.email, ipAddress: actor.ipAddress ?? null, userAgent: actor.userAgent ?? null }
    : { actorType: 'SYSTEM' as const, actorId: 'system', actorEmail: null, ipAddress: null, userAgent: null };
}

function activityActor(actor: SuspensionActor): { actorType: ActivityActorType; actorId: string | null; actorLabel: string } {
  return actor.type === 'STAFF' ? { actorType: 'STAFF', actorId: actor.platformUserId, actorLabel: actor.label } : { actorType: 'SYSTEM', actorId: null, actorLabel: actor.label };
}

/** A closed tenant is never reactivated by lifting suspensions (D3). */
function isClosed(tenant: Pick<Tenant, 'status'> & { closedAt?: Date | null }) {
  return tenant.status === 'CANCELLED' || Boolean(tenant.closedAt);
}

function afterCommit(app: SuspensionApp, tenantId: string) {
  // Other instances drop any cached tenant/entitlement state; failures never undo the change.
  app.redis
    ?.publish(`tenant:${tenantId}:status-changed`, JSON.stringify({ tenantId }))
    .catch((err: unknown) => app.log.error({ err, tenantId }, 'Failed to publish tenant status change'));
  app.redis?.del(`tenant:${tenantId}:cache`).catch((err: unknown) => app.log.error({ err, tenantId }, 'Failed to invalidate tenant cache'));
}

export type SuspendInput = {
  tenantId: string;
  source: SuspensionSource;
  category: SuspensionCategory;
  /** Internal, staff-only reason. */
  reason: string;
  /** Tenant-facing reason; defaults per category. */
  publicReason?: string | null;
  actor: SuspensionActor;
  sourceRef?: string | null;
  sourceSignalId?: string | null;
};

/**
 * Adds one ACTIVE suspension cause and suspends the tenant (one transaction: record, tenant status, audit, activity),
 * then notifies tenant admins when the tenant has just become suspended. A second cause adds a second record. A repeated
 * call with the same source + sourceRef (e.g. a retried Stripe webhook) returns the existing ACTIVE record.
 */
export async function suspendTenant(app: SuspensionApp, input: SuspendInput) {
  const publicReason = input.publicReason?.trim() || DEFAULT_PUBLIC_REASONS[input.category];
  const result = await app.prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new SuspensionError('TENANT_NOT_FOUND', 404, 'Tenant not found');

    if (input.sourceRef) {
      const duplicate = await tx.suspensionRecord.findFirst({
        where: { tenantId: tenant.id, status: 'ACTIVE', source: input.source, sourceRef: input.sourceRef }
      });
      if (duplicate) return { record: duplicate, tenant, becameSuspended: false, duplicate: true, activity: null };
    }

    const record = await tx.suspensionRecord.create({
      data: {
        tenantId: tenant.id,
        reason: input.reason,
        publicReason,
        source: input.source,
        category: input.category,
        sourceRef: input.sourceRef ?? null,
        sourceSignalId: input.sourceSignalId ?? null,
        suspendedBy: input.actor.type === 'STAFF' ? input.actor.platformUserId : 'system',
        status: 'ACTIVE'
      }
    });

    const becameSuspended = tenant.status !== 'SUSPENDED' && !isClosed(tenant);
    const updated = isClosed(tenant)
      ? tenant
      : await tx.tenant.update({
          where: { id: tenant.id },
          data: becameSuspended ? { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: publicReason } : { suspensionReason: publicReason }
        });

    await writePlatformAuditLog(tx, {
      ...actorColumns(input.actor),
      action: 'TENANT_SUSPENSION',
      targetTenantId: tenant.id,
      reason: input.reason,
      metadata: { suspensionId: record.id, source: input.source, category: input.category, sourceRef: input.sourceRef ?? null, publicReason, previousStatus: tenant.status, nextStatus: updated.status }
    });
    const activity = await recordActivity(tx, {
      service: 'platform.tenants',
      type: 'tenant.suspended',
      tenantId: tenant.id,
      ...activityActor(input.actor),
      subjectType: 'suspension_record',
      subjectId: record.id,
      summary: `${tenant.name} suspended (${input.source.toLowerCase()}, ${input.category.toLowerCase()})`,
      severity: 'CRITICAL',
      consoleLink: `/platform/tenants/${tenant.id}`,
      metadata: { source: input.source, category: input.category, sourceRef: input.sourceRef ?? null },
      dedupeKey: `tenant.suspended:${record.id}`
    });
    return { record, tenant: updated, becameSuspended, duplicate: false, activity };
  });

  if (!result.duplicate) {
    if (result.activity) publishActivity(app.redis, result.activity, app.log);
    afterCommit(app, input.tenantId);
    if (result.becameSuspended) {
      await notifyTenantAdmins(app, {
        tenantId: input.tenantId,
        event: 'tenant.suspended',
        title: 'Your workspace has been suspended',
        body: publicReason,
        link: '/settings/billing',
        email: { template: 'tenant_suspended', data: { tenantName: result.tenant.name, reason: publicReason, category: input.category } }
      });
    }
  }
  return { record: result.record, tenant: result.tenant, becameSuspended: result.becameSuspended, duplicate: result.duplicate };
}

export type LiftInput = {
  tenantId: string;
  /** One cause to lift. Omit to lift every ACTIVE cause (the caller has confirmed). */
  suspensionId?: string | null;
  via: LiftVia;
  reason: string;
  actor: SuspensionActor;
};

/**
 * Lifts one cause (or all). The tenant becomes ACTIVE only when no ACTIVE cause remains and it is not closed; tenant
 * admins are notified when that happens.
 */
export async function liftSuspension(app: SuspensionApp, input: LiftInput) {
  const now = new Date();
  const result = await app.prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new SuspensionError('TENANT_NOT_FOUND', 404, 'Tenant not found');

    let targets: SuspensionRecord[];
    if (input.suspensionId) {
      const record = await tx.suspensionRecord.findFirst({ where: { id: input.suspensionId, tenantId: tenant.id } });
      if (!record) throw new SuspensionError('SUSPENSION_NOT_FOUND', 404, 'Suspension not found for this tenant');
      if (record.status !== 'ACTIVE') throw new SuspensionError('SUSPENSION_NOT_ACTIVE', 409, 'This suspension has already been lifted');
      targets = [record];
    } else {
      targets = await tx.suspensionRecord.findMany({ where: { tenantId: tenant.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
      if (targets.length === 0) throw new SuspensionError('NO_ACTIVE_SUSPENSION', 409, 'The tenant has no active suspension');
    }

    const liftedBy = input.actor.type === 'STAFF' ? input.actor.platformUserId : 'system';
    await tx.suspensionRecord.updateMany({
      where: { id: { in: targets.map((record) => record.id) }, tenantId: tenant.id, status: 'ACTIVE' },
      data: { status: 'LIFTED', liftedBy, liftedVia: input.via, liftReason: input.reason, liftedAt: now }
    });
    const remaining = await tx.suspensionRecord.findMany({ where: { tenantId: tenant.id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });

    const becameActive = remaining.length === 0 && tenant.status === 'SUSPENDED' && !isClosed(tenant);
    let updated = tenant;
    if (becameActive) {
      updated = await tx.tenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE', suspendedAt: null, suspensionReason: null } });
    } else if (remaining.length > 0 && !isClosed(tenant)) {
      updated = await tx.tenant.update({ where: { id: tenant.id }, data: { suspensionReason: remaining[0].publicReason ?? DEFAULT_PUBLIC_REASONS.OTHER } });
    }

    await writePlatformAuditLog(tx, {
      ...actorColumns(input.actor),
      action: 'TENANT_UNSUSPEND',
      targetTenantId: tenant.id,
      reason: input.reason,
      metadata: { suspensionIds: targets.map((record) => record.id), via: input.via, remainingActive: remaining.length, previousStatus: tenant.status, nextStatus: updated.status }
    });
    const activity = await recordActivity(tx, {
      service: 'platform.tenants',
      type: becameActive ? 'tenant.unsuspended' : 'tenant.suspension_lifted',
      tenantId: tenant.id,
      ...activityActor(input.actor),
      subjectType: 'suspension_record',
      subjectId: targets[0].id,
      summary: becameActive
        ? `${tenant.name} reactivated (${input.via.toLowerCase()})`
        : `${tenant.name}: ${targets.length} suspension cause(s) lifted (${input.via.toLowerCase()}), ${remaining.length} still active`,
      severity: 'ATTENTION',
      consoleLink: `/platform/tenants/${tenant.id}`,
      metadata: { via: input.via, liftedIds: targets.map((record) => record.id), remainingActive: remaining.length },
      dedupeKey: `tenant.suspension_lifted:${targets.map((record) => record.id).join(',')}`
    });
    return { lifted: targets.map((record) => ({ ...record, status: 'LIFTED', liftedBy, liftedVia: input.via, liftReason: input.reason, liftedAt: now })), remaining, tenant: updated, becameActive, activity };
  });

  publishActivity(app.redis, result.activity, app.log);
  afterCommit(app, input.tenantId);
  if (result.becameActive) {
    await notifyTenantAdmins(app, {
      tenantId: input.tenantId,
      event: 'tenant.unsuspended',
      title: 'Your workspace is active again',
      body: 'Fauward has lifted the suspension on your workspace.',
      link: '/dashboard',
      email: { template: 'tenant_unsuspended', data: { tenantName: result.tenant.name, via: input.via } }
    });
  }
  return { lifted: result.lifted, remaining: result.remaining, tenant: result.tenant, becameActive: result.becameActive };
}

/** Latest ACTIVE cause, or null. */
export async function getActiveSuspension(db: SuspensionDb, tenantId: string) {
  return db.suspensionRecord.findFirst({ where: { tenantId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
}

export async function getActiveSuspensions(db: SuspensionDb, tenantId: string) {
  return db.suspensionRecord.findMany({ where: { tenantId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
}

/** `invoice.paid` (or a manual payment) lifts the DUNNING cause opened for that invoice, if any (D3 caller 3). */
export async function liftDunningSuspensionForInvoice(app: SuspensionApp, input: { tenantId: string; invoiceRef: string; actor: SuspensionActor }) {
  const record = await app.prisma.suspensionRecord.findFirst({ where: { tenantId: input.tenantId, status: 'ACTIVE', source: 'DUNNING', sourceRef: input.invoiceRef } });
  if (!record) return null;
  return liftSuspension(app, { tenantId: input.tenantId, suspensionId: record.id, via: 'PAYMENT', reason: `Invoice ${input.invoiceRef} paid`, actor: input.actor });
}

/** Staff actor from an authenticated console request. */
export function staffSuspensionActor(request: { platform?: { user: { id: string; email: string; name: string | null } }; ip: string; headers: Record<string, unknown> }): SuspensionActor {
  const user = request.platform!.user;
  const forwarded = request.headers['x-forwarded-for'];
  return {
    type: 'STAFF',
    platformUserId: user.id,
    email: user.email,
    label: user.name ?? user.email,
    ipAddress: typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.ip,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null
  };
}
