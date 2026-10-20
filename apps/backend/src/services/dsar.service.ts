import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { DSARRequest, Prisma } from '@prisma/client';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';
import { PERSONAL_DATA_REGISTRY, type DataSubject } from '../config/personal-data-registry.js';
import { exportStorageFor, postgresExportStorage } from './export-storage.js';
import { activeLegalHoldForTenant } from './legal-hold.service.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from './platform-activity.service.js';
import { notifyStaff, notifyTenantAdmins } from './platform-notifier.service.js';

// trust.compliance (WP-2.5, L4). A DSAR moves RECEIVED → IDENTITY_VERIFIED → GATHERING → DATA_GATHERED → APPROVED →
// DELIVERED (ACCESS/PORTABILITY/RECTIFICATION) or → ERASING → ERASED (ERASURE), then CLOSED. Gather and erase run as
// jobs on the scheduled-jobs queue; every status change writes a DSARTransition. Legal holds block erasure.

export const DSAR_TYPES = ['ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION'] as const;
export type DsarType = (typeof DSAR_TYPES)[number];
export const DSAR_DUE_DAYS = 30;
export const DSAR_DOWNLOAD_TTL_DAYS = 7;
export const OPEN_DSAR_STATUSES = ['RECEIVED', 'IDENTITY_VERIFIED', 'GATHERING', 'DATA_GATHERED', 'APPROVED', 'ERASING'];
export const DSAR_GATHER_JOB = 'trust.dsar-gather';
export const DSAR_ERASE_JOB = 'trust.dsar-erase';

type DsarApp = FastifyInstance;
type TransitionDb = Pick<Prisma.TransactionClient, 'dSARRequest' | 'dSARTransition'>;

export class DsarError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function dsarDueDate(from = new Date()) {
  return new Date(from.getTime() + DSAR_DUE_DAYS * 24 * 60 * 60 * 1000);
}

export function hashDownloadToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function issueDownloadToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashDownloadToken(token), expiresAt: new Date(Date.now() + DSAR_DOWNLOAD_TTL_DAYS * 24 * 60 * 60 * 1000) };
}

export function tenantDownloadLink(dsarId: string, token: string) {
  return `/settings?tab=privacy&dsar=${encodeURIComponent(dsarId)}&token=${encodeURIComponent(token)}`;
}

/**
 * Moves a DSAR from one of `from` to `to` (guarded: a concurrent change makes it a 409) and records the transition.
 */
export async function transitionDsar(
  db: TransitionDb,
  dsar: Pick<DSARRequest, 'id' | 'tenantId' | 'status'>,
  input: { from: string[]; to: string; actorId: string; notes?: string | null; data?: Prisma.DSARRequestUpdateManyMutationInput }
) {
  if (!input.from.includes(dsar.status)) {
    throw new DsarError(409, 'INVALID_TRANSITION', `The request is ${dsar.status.toLowerCase().replace(/_/g, ' ')}; it cannot move to ${input.to.toLowerCase().replace(/_/g, ' ')}.`);
  }
  const claimed = await db.dSARRequest.updateMany({ where: { id: dsar.id, tenantId: dsar.tenantId, status: dsar.status }, data: { ...input.data, status: input.to } });
  if (claimed.count !== 1) throw new DsarError(409, 'CONCURRENT_CHANGE', 'The request changed while this action ran; reload and try again.');
  await db.dSARTransition.create({ data: { dsarId: dsar.id, fromStatus: dsar.status, toStatus: input.to, actorId: input.actorId, notes: input.notes ?? null } });
  return db.dSARRequest.findFirstOrThrow({ where: { id: dsar.id, tenantId: dsar.tenantId } });
}

async function resolveSubject(app: DsarApp, dsar: DSARRequest): Promise<DataSubject> {
  const email = dsar.requesterEmail.trim().toLowerCase();
  if (dsar.subjectUserId) return { tenantId: dsar.tenantId, userId: dsar.subjectUserId, email };
  const user = await app.prisma.user.findFirst({ where: { tenantId: dsar.tenantId, email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  return { tenantId: dsar.tenantId, userId: user?.id ?? null, email };
}

/** Collects the subject's rows from every registry model. Exported for the ACC-DSAR-2 isolation test. */
export async function collectSubjectData(app: DsarApp, subject: DataSubject) {
  const records: Record<string, unknown[]> = {};
  for (const entry of PERSONAL_DATA_REGISTRY) {
    records[entry.model] = await entry.find(app.prisma, subject);
  }
  return records;
}

function activityDeps(app: DsarApp) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

async function tenantName(app: DsarApp, tenantId: string) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name ?? tenantId;
}

/** `trust.dsar-gather`: writes a JSON bundle of the subject's data through the storage adapter. */
export async function gatherDsar(app: DsarApp, input: { dsarId: string; exportId: string }) {
  return runWithTenantContext(systemContext(), async () => {
    const exportRow = await app.prisma.complianceExport.findFirst({ where: { id: input.exportId, dsarId: input.dsarId } });
    if (!exportRow || !exportRow.tenantId) return { status: 'MISSING' as const };
    const dsar = await app.prisma.dSARRequest.findFirst({ where: { id: input.dsarId, tenantId: exportRow.tenantId } });
    if (!dsar || dsar.status !== 'GATHERING' || exportRow.status !== 'QUEUED') return { status: 'SKIPPED' as const };
    await app.prisma.complianceExport.updateMany({ where: { id: exportRow.id, tenantId: dsar.tenantId }, data: { status: 'RUNNING' } });
    try {
      const subject = await resolveSubject(app, dsar);
      const records = await collectSubjectData(app, subject);
      const bundle = {
        dsarId: dsar.id,
        requestType: dsar.requestType,
        tenantId: dsar.tenantId,
        subject: { email: subject.email, userId: subject.userId },
        generatedAt: new Date().toISOString(),
        registry: PERSONAL_DATA_REGISTRY.map((entry) => ({ model: entry.model, fields: entry.exportFields, erasure: entry.strategy })),
        records
      };
      const stored = await postgresExportStorage(app.prisma).put(dsar.tenantId, Buffer.from(JSON.stringify(bundle, null, 2), 'utf8'));
      await app.prisma.complianceExport.updateMany({
        where: { id: exportRow.id, tenantId: dsar.tenantId },
        data: { status: 'READY', storageProvider: stored.provider, s3Key: stored.key, byteSize: stored.byteSize, sha256: stored.sha256, error: null }
      });
      const counts = Object.fromEntries(Object.entries(records).map(([model, rows]) => [model, rows.length]));
      await transitionDsar(app.prisma, dsar, { from: ['GATHERING'], to: 'DATA_GATHERED', actorId: 'system:trust.dsar-gather', notes: `Bundle ${stored.byteSize} bytes`, data: { subjectUserId: subject.userId } });
      await recordAndPublishActivity(activityDeps(app), {
        service: 'trust.compliance',
        type: 'dsar.gathered',
        tenantId: dsar.tenantId,
        ...SYSTEM_ACTOR,
        subjectType: 'dsar_request',
        subjectId: dsar.id,
        summary: `${dsar.requestType} request data gathered for review (${await tenantName(app, dsar.tenantId)})`,
        consoleLink: `/trust/compliance/dsar/${dsar.id}`,
        dedupeKey: `dsar.gathered:${exportRow.id}`,
        metadata: { counts }
      });
      return { status: 'READY' as const, counts };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await app.prisma.complianceExport.updateMany({ where: { id: exportRow.id, tenantId: dsar.tenantId }, data: { status: 'FAILED', error: message.slice(0, 1000) } });
      await transitionDsar(app.prisma, dsar, { from: ['GATHERING'], to: 'IDENTITY_VERIFIED', actorId: 'system:trust.dsar-gather', notes: `Gather failed: ${message.slice(0, 300)}` });
      app.log.error({ err: error, dsarId: dsar.id }, 'DSAR gather failed');
      return { status: 'FAILED' as const, error: message };
    }
  });
}

/** `trust.dsar-erase`: applies every registry strategy in one transaction, unless a legal hold appeared meanwhile. */
export async function eraseDsar(app: DsarApp, input: { dsarId: string; tenantId: string }) {
  return runWithTenantContext(systemContext(), async () => {
    const dsar = await app.prisma.dSARRequest.findFirst({ where: { id: input.dsarId, tenantId: input.tenantId } });
    if (!dsar || dsar.status !== 'ERASING') return { status: 'SKIPPED' as const };
    const hold = await activeLegalHoldForTenant(app.prisma, dsar.tenantId);
    if (hold) {
      await transitionDsar(app.prisma, dsar, { from: ['ERASING'], to: 'APPROVED', actorId: 'system:trust.dsar-erase', notes: `Blocked by legal hold ${hold.id}` });
      await recordAndPublishActivity(activityDeps(app), {
        service: 'trust.compliance',
        type: 'dsar.erase_blocked',
        tenantId: dsar.tenantId,
        ...SYSTEM_ACTOR,
        subjectType: 'dsar_request',
        subjectId: dsar.id,
        summary: `Erasure blocked by an active legal hold (${await tenantName(app, dsar.tenantId)})`,
        severity: 'ATTENTION',
        consoleLink: `/trust/compliance/dsar/${dsar.id}`
      });
      return { status: 'BLOCKED' as const, holdId: hold.id };
    }
    const subject = await resolveSubject(app, dsar);
    const counts: Record<string, number> = {};
    await app.prisma.$transaction(async (tx) => {
      for (const entry of PERSONAL_DATA_REGISTRY) counts[entry.model] = await entry.erase(tx, subject);
      // Gathered bundles contain the erased data: remove them too.
      const exports = await tx.complianceExport.findMany({ where: { tenantId: dsar.tenantId, dsarId: dsar.id, s3Key: { not: null } }, select: { id: true, s3Key: true, storageProvider: true } });
      for (const row of exports) {
        await exportStorageFor(tx, row.storageProvider)?.remove(dsar.tenantId, row.s3Key!);
      }
      await tx.complianceExport.updateMany({ where: { tenantId: dsar.tenantId, dsarId: dsar.id }, data: { s3Key: null, downloadTokenHash: null, status: 'PURGED' } });
      await transitionDsar(tx, dsar, { from: ['ERASING'], to: 'ERASED', actorId: 'system:trust.dsar-erase', notes: JSON.stringify(counts), data: { erasureCompletedAt: new Date(), subjectUserId: subject.userId } });
    });
    await recordAndPublishActivity(activityDeps(app), {
      service: 'trust.compliance',
      type: 'dsar.erased',
      tenantId: dsar.tenantId,
      ...SYSTEM_ACTOR,
      subjectType: 'dsar_request',
      subjectId: dsar.id,
      summary: `Erasure completed (${await tenantName(app, dsar.tenantId)})`,
      consoleLink: `/trust/compliance/dsar/${dsar.id}`,
      dedupeKey: `dsar.erased:${dsar.id}`,
      metadata: { counts }
    });
    await notifyTenantAdmins(app, {
      tenantId: dsar.tenantId,
      event: 'dsar.erased',
      title: 'Erasure request completed',
      body: `Personal data for ${subject.email} has been erased.`,
      link: '/settings?tab=privacy',
      email: { template: 'dsar_completed_erasure', data: { subjectEmail: subject.email } }
    });
    return { status: 'ERASED' as const, counts };
  });
}

/** Daily: an open request past its due date raises one ATTENTION activity and notifies DSAR staff (ACC-DSAR-5). */
export async function sweepOverdueDsars(app: DsarApp, now = new Date()) {
  return runWithTenantContext(systemContext(), async () => {
    const overdue = await app.prisma.dSARRequest.findMany({ where: { status: { in: OPEN_DSAR_STATUSES }, dueAt: { lt: now }, overdueAt: null }, orderBy: { dueAt: 'asc' }, take: 500 });
    let flagged = 0;
    for (const dsar of overdue) {
      const claimed = await app.prisma.dSARRequest.updateMany({ where: { id: dsar.id, tenantId: dsar.tenantId, overdueAt: null }, data: { overdueAt: now } });
      if (claimed.count !== 1) continue;
      flagged += 1;
      const name = await tenantName(app, dsar.tenantId);
      await recordAndPublishActivity(activityDeps(app), {
        service: 'trust.compliance',
        type: 'dsar.overdue',
        tenantId: dsar.tenantId,
        ...SYSTEM_ACTOR,
        subjectType: 'dsar_request',
        subjectId: dsar.id,
        summary: `${dsar.requestType} request for ${name} is past its due date (${dsar.status.toLowerCase().replace(/_/g, ' ')})`,
        severity: 'ATTENTION',
        consoleLink: `/trust/compliance/dsar/${dsar.id}`,
        dedupeKey: `dsar.overdue:${dsar.id}`
      });
      await notifyStaff(app, {
        permission: 'trust.compliance.dsar.read',
        event: 'dsar.overdue',
        title: `Overdue ${dsar.requestType} request`,
        body: `${name}: due ${dsar.dueAt.toISOString().slice(0, 10)}, still ${dsar.status.toLowerCase().replace(/_/g, ' ')}`,
        link: `/trust/compliance/dsar/${dsar.id}`,
        severity: 'ATTENTION',
        tenantId: dsar.tenantId
      });
    }
    return { checked: overdue.length, flagged };
  });
}
