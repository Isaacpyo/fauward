import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ComplianceExport, DSARRequest, LegalHold, Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { loadConsoleContext, requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import type { Permission } from '@fauward/internal-rbac';
import { scheduledJobsQueue } from '../../../queues/queues.js';
import {
  DSAR_ERASE_JOB,
  DSAR_GATHER_JOB,
  DSAR_TYPES,
  DsarError,
  OPEN_DSAR_STATUSES,
  dsarDueDate,
  issueDownloadToken,
  tenantDownloadLink,
  transitionDsar
} from '../../../services/dsar.service.js';
import { activeLegalHoldForTenant } from '../../../services/legal-hold.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { notifyTenantAdmins } from '../../../services/platform-notifier.service.js';
import { writeInternalAudit } from '../internal-audit.js';

// trust.compliance (WP-2.5, L4): DSAR queue and state machine, gather/erase jobs, one-time download tokens delivered
// to the tenant, legal holds with release. Delivery, erasure and hold create/release are dangerous (fresh MFA + reason).

const listDsar = z.object({
  status: z.string().min(1).optional(),
  type: z.enum(DSAR_TYPES).optional(),
  tenantId: z.string().min(1).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional()
});
const createDsar = z.object({
  tenantId: z.string().min(1),
  requestType: z.enum(DSAR_TYPES),
  subjectEmail: z.string().trim().toLowerCase().email(),
  notes: z.string().trim().max(4000).optional(),
  reason: z.string().trim().min(8).optional()
});
const stepBody = z.object({ notes: z.string().trim().max(2000).optional(), reason: z.string().trim().max(2000).optional() });
const closeBody = z.object({ reason: z.string().trim().min(8, 'Say why the request is being closed (at least 8 characters).') });
const listHolds = z.object({ status: z.enum(['ACTIVE', 'RELEASED']).optional(), tenantId: z.string().min(1).optional() });
const createHold = z
  .object({
    tenantId: z.string().min(1).optional(),
    appliesToAllTenants: z.boolean().default(false),
    reason: z.string().trim().min(8),
    scope: z.record(z.unknown()).optional()
  })
  .refine((body) => Boolean(body.tenantId) !== body.appliesToAllTenants, 'Name one tenant, or set appliesToAllTenants for a hold on every tenant.');
const releaseHold = z.object({ reason: z.string().trim().min(8) });
const listExports = z.object({ tenantId: z.string().min(1).optional(), dsarId: z.string().min(1).optional() });

function validation(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: 'VALIDATION', message: error.issues.map((issue) => issue.message).join(' ') });
}

function dsarErrorReply(reply: FastifyReply, error: unknown) {
  if (error instanceof DsarError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

const read = (permission: Permission) => ({ preHandler: [authenticatePlatformSession, requireConsolePermission(permission)] });
const write = (permission: Permission) => ({ preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission(permission)] });
const danger = (permission: Permission) => ({ preHandler: dangerous(permission) });

type TenantLabel = { id: string; name: string; slug: string };

async function tenantLabels(app: FastifyInstance, ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map<string, TenantLabel>();
  const tenants = await app.prisma.tenant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, slug: true } });
  return new Map(tenants.map((tenant) => [tenant.id, tenant]));
}

const label = (tenants: Map<string, TenantLabel>, id: string | null) => (id ? tenants.get(id) ?? { id, name: id, slug: id } : null);

function parseNotes(notes: string | null) {
  if (!notes) return { text: null as string | null, details: null as Record<string, unknown> | null };
  try {
    const parsed: unknown = JSON.parse(notes);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { text: null, details: parsed as Record<string, unknown> };
  } catch {
    // plain text notes (staff-logged requests)
  }
  return { text: notes, details: null };
}

export function presentDsar(dsar: DSARRequest, tenant: TenantLabel | null, now = new Date()) {
  const notes = parseNotes(dsar.notes);
  return {
    id: dsar.id,
    tenant,
    requestType: dsar.requestType,
    subjectEmail: dsar.requesterEmail,
    subjectUserId: dsar.subjectUserId,
    status: dsar.status,
    notes: notes.text,
    details: notes.details,
    receivedAt: dsar.receivedAt.toISOString(),
    dueAt: dsar.dueAt.toISOString(),
    overdue: OPEN_DSAR_STATUSES.includes(dsar.status) && dsar.dueAt < now,
    identityVerifiedAt: dsar.identityVerifiedAt?.toISOString() ?? null,
    erasureCompletedAt: dsar.erasureCompletedAt?.toISOString() ?? null,
    closedAt: dsar.closedAt?.toISOString() ?? null,
    createdAt: dsar.createdAt.toISOString()
  };
}

export function presentExport(row: ComplianceExport, tenant: TenantLabel | null) {
  return {
    id: row.id,
    tenant,
    dsarId: row.dsarId,
    exportType: row.exportType,
    status: row.status,
    storageProvider: row.storageProvider,
    byteSize: row.byteSize,
    sha256: row.sha256,
    tokenIssued: Boolean(row.downloadTokenHash),
    tokenExpiresAt: row.expiresAt?.toISOString() ?? null,
    downloadedAt: row.downloadedAt?.toISOString() ?? null,
    error: row.error,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString()
  };
}

function presentHold(hold: LegalHold, tenant: TenantLabel | null) {
  return {
    id: hold.id,
    tenant,
    appliesToAllTenants: hold.appliesToAllTenants,
    scope: hold.scope,
    reason: hold.reason,
    status: hold.status,
    createdBy: hold.createdBy,
    createdAt: hold.createdAt.toISOString(),
    releasedBy: hold.releasedBy,
    releasedAt: hold.releasedAt?.toISOString() ?? null,
    releaseReason: hold.releaseReason
  };
}

const JIT_ROOT_PERMISSION: Permission = 'trust.iam.root';

/**
 * A global legal hold (every tenant) is placed or released only inside an approved JIT ROOT session (two approvers,
 * WP-1.7), on top of the dangerous-action guard (WP-5.2). The grant id is stamped on the audit row.
 */
async function requireJitRoot(request: FastifyRequest, reply: FastifyReply) {
  const grant = (await loadConsoleContext(request)).jit.get(JIT_ROOT_PERMISSION);
  if (!grant) {
    reply.status(403).send({ error: 'JIT_ROOT_REQUIRED', message: 'A legal hold on every tenant needs an approved JIT ROOT session (trust.iam.root).' });
    return false;
  }
  request.jitSessionId = grant.id;
  return true;
}

function activityDeps(app: FastifyInstance, request: FastifyRequest) {
  return { prisma: app.prisma, redis: app.redis, log: request.log };
}

function staffId(request: FastifyRequest) {
  return request.platform!.user.id;
}

export async function registerConsoleComplianceRoutes(app: FastifyInstance) {
  async function loadDsar(id: string) {
    const dsar = await app.prisma.dSARRequest.findUnique({ where: { id } });
    if (!dsar) throw new DsarError(404, 'NOT_FOUND', 'DSAR request not found');
    return dsar;
  }

  async function dsarActivity(request: FastifyRequest, dsar: DSARRequest, type: string, summary: string, extra: { severity?: 'INFO' | 'ATTENTION'; metadata?: Prisma.InputJsonObject } = {}) {
    await recordAndPublishActivity(activityDeps(app, request), {
      service: 'trust.compliance',
      type,
      tenantId: dsar.tenantId,
      ...staffActor(request),
      subjectType: 'dsar_request',
      subjectId: dsar.id,
      summary,
      severity: extra.severity ?? 'INFO',
      consoleLink: `/trust/compliance/dsar/${dsar.id}`,
      ...(extra.metadata ? { metadata: extra.metadata } : {})
    });
  }

  app.get('/api/internal/compliance/dsar', read('trust.compliance.dsar.read'), async (request, reply) => {
    const parsed = listDsar.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const query = parsed.data;
    const now = new Date();
    const where: Prisma.DSARRequestWhereInput = {
      ...(query.status === 'OPEN' ? { status: { in: OPEN_DSAR_STATUSES } } : query.status ? { status: query.status } : {}),
      ...(query.type ? { requestType: query.type } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.overdue === 'true' ? { status: { in: OPEN_DSAR_STATUSES }, dueAt: { lt: now } } : {})
    };
    const rows = await app.prisma.dSARRequest.findMany({ where, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;
    const tenants = await tenantLabels(app, data.map((row) => row.tenantId));
    return reply.send({ data: data.map((row) => presentDsar(row, label(tenants, row.tenantId), now)), nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null });
  });

  app.get('/api/internal/compliance/dsar/:id', read('trust.compliance.dsar.read'), async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const dsar = await loadDsar(id);
      const [transitions, exports, hold, subjectUser] = await Promise.all([
        app.prisma.dSARTransition.findMany({ where: { dsarId: dsar.id, dsar: { tenantId: dsar.tenantId } }, orderBy: { createdAt: 'asc' } }),
        app.prisma.complianceExport.findMany({ where: { dsarId: dsar.id, tenantId: dsar.tenantId }, orderBy: { createdAt: 'desc' } }),
        activeLegalHoldForTenant(app.prisma, dsar.tenantId),
        app.prisma.user.findFirst({ where: { tenantId: dsar.tenantId, email: { equals: dsar.requesterEmail, mode: 'insensitive' } }, select: { id: true, role: true, firstName: true, lastName: true, createdAt: true } })
      ]);
      const tenants = await tenantLabels(app, [dsar.tenantId]);
      const tenant = label(tenants, dsar.tenantId);
      return reply.send({
        dsar: presentDsar(dsar, tenant),
        transitions: transitions.map((row) => ({ id: row.id, fromStatus: row.fromStatus, toStatus: row.toStatus, actorId: row.actorId, notes: row.notes, createdAt: row.createdAt.toISOString() })),
        exports: exports.map((row) => presentExport(row, tenant)),
        legalHold: hold ? { id: hold.id, reason: hold.reason } : null,
        subjectAccount: subjectUser ? { id: subjectUser.id, role: subjectUser.role, name: [subjectUser.firstName, subjectUser.lastName].filter(Boolean).join(' ') || null, createdAt: subjectUser.createdAt.toISOString() } : null
      });
    } catch (error) {
      return dsarErrorReply(reply, error);
    }
  });

  // A request received outside the portal (e-mail, post); logged by staff.
  app.post('/api/internal/compliance/dsar', write('trust.compliance.dsar.write'), async (request, reply) => {
    const parsed = createDsar.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const input = parsed.data;
    const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, name: true, slug: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const dsar = await app.prisma.$transaction(async (tx) => {
      const created = await tx.dSARRequest.create({ data: { tenantId: tenant.id, requesterEmail: input.subjectEmail, requestType: input.requestType, status: 'RECEIVED', notes: input.notes ?? null, dueAt: dsarDueDate() } });
      await tx.dSARTransition.create({ data: { dsarId: created.id, fromStatus: null, toStatus: 'RECEIVED', actorId: staffId(request), notes: 'Logged by Fauward staff' } });
      return created;
    });
    await writeInternalAudit(request, 'compliance.dsar.create', 'dsar_request', dsar.id, null, { requestType: dsar.requestType, status: dsar.status }, input.reason ?? 'DSAR received outside the portal', { targetTenantId: tenant.id });
    await dsarActivity(request, dsar, 'dsar.requested', `${dsar.requestType} request logged for ${tenant.name}`);
    return reply.status(201).send({ dsar: presentDsar(dsar, tenant) });
  });

  app.post('/api/internal/compliance/dsar/:id/verify-identity', write('trust.compliance.dsar.write'), async (request, reply) => {
    const parsed = stepBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    try {
      const dsar = await loadDsar(id);
      const after = await transitionDsar(app.prisma, dsar, { from: ['RECEIVED'], to: 'IDENTITY_VERIFIED', actorId: staffId(request), notes: parsed.data.notes ?? null, data: { identityVerifiedAt: new Date() } });
      await writeInternalAudit(request, 'compliance.dsar.verify_identity', 'dsar_request', dsar.id, { status: dsar.status }, { status: after.status }, parsed.data.notes ?? parsed.data.reason ?? null, { targetTenantId: dsar.tenantId });
      return reply.send({ dsar: presentDsar(after, null) });
    } catch (error) {
      return dsarErrorReply(reply, error);
    }
  });

  app.post('/api/internal/compliance/dsar/:id/gather', write('trust.compliance.dsar.write'), async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const dsar = await loadDsar(id);
      const { after, exportRow } = await app.prisma.$transaction(async (tx) => {
        const moved = await transitionDsar(tx, dsar, { from: ['IDENTITY_VERIFIED', 'DATA_GATHERED'], to: 'GATHERING', actorId: staffId(request), notes: 'Gather queued' });
        const created = await tx.complianceExport.create({ data: { tenantId: dsar.tenantId, dsarId: dsar.id, exportType: 'DSAR_BUNDLE', status: 'QUEUED', requestedBy: staffId(request) } });
        return { after: moved, exportRow: created };
      });
      try {
        await scheduledJobsQueue.add(DSAR_GATHER_JOB, { dsarId: dsar.id, exportId: exportRow.id }, { jobId: `${DSAR_GATHER_JOB}:${exportRow.id}`, removeOnComplete: 100, removeOnFail: 100 });
      } catch (error) {
        request.log.error({ err: error, dsarId: dsar.id }, 'Failed to queue DSAR gather');
        await app.prisma.complianceExport.updateMany({ where: { id: exportRow.id, tenantId: dsar.tenantId }, data: { status: 'FAILED', error: 'QUEUE_UNAVAILABLE' } });
        await transitionDsar(app.prisma, after, { from: ['GATHERING'], to: dsar.status, actorId: staffId(request), notes: 'Gather could not be queued' });
        return reply.status(503).send({ error: 'QUEUE_UNAVAILABLE', message: 'The gather job could not be queued; nothing changed. Try again shortly.' });
      }
      await writeInternalAudit(request, 'compliance.dsar.gather', 'dsar_request', dsar.id, { status: dsar.status }, { status: after.status, exportId: exportRow.id }, null, { targetTenantId: dsar.tenantId });
      return reply.status(202).send({ dsar: presentDsar(after, null), export: presentExport(exportRow, null) });
    } catch (error) {
      return dsarErrorReply(reply, error);
    }
  });

  app.post('/api/internal/compliance/dsar/:id/approve', write('trust.compliance.dsar.write'), async (request, reply) => {
    const parsed = stepBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    try {
      const dsar = await loadDsar(id);
      const after = await transitionDsar(app.prisma, dsar, { from: ['DATA_GATHERED'], to: 'APPROVED', actorId: staffId(request), notes: parsed.data.notes ?? 'Export reviewed' });
      await writeInternalAudit(request, 'compliance.dsar.approve', 'dsar_request', dsar.id, { status: dsar.status }, { status: after.status }, parsed.data.notes ?? null, { targetTenantId: dsar.tenantId });
      return reply.send({ dsar: presentDsar(after, null) });
    } catch (error) {
      return dsarErrorReply(reply, error);
    }
  });

  // Issues a one-time download token (only its hash is stored) and sends the link to the tenant's admins.
  app.post('/api/internal/compliance/dsar/:id/deliver', danger('trust.compliance.dsar.deliver'), async (request, reply) => {
    const { id } = request.params as { id: string };
    const reason = (request.body as { reason?: string } | undefined)?.reason ?? null;
    try {
      const dsar = await loadDsar(id);
      if (dsar.requestType === 'ERASURE') return reply.status(409).send({ error: 'ERASURE_NOT_DELIVERED', message: 'Erasure requests are completed with Erase, not delivered.' });
      const ready = await app.prisma.complianceExport.findFirst({ where: { dsarId: dsar.id, tenantId: dsar.tenantId, status: 'READY' }, orderBy: { createdAt: 'desc' } });
      if (!ready) return reply.status(409).send({ error: 'NO_EXPORT', message: 'Gather and review the data before delivering it.' });
      const token = issueDownloadToken();
      const after = await app.prisma.$transaction(async (tx) => {
        await tx.complianceExport.updateMany({ where: { id: ready.id, tenantId: dsar.tenantId }, data: { downloadTokenHash: token.hash, expiresAt: token.expiresAt, downloadedAt: null } });
        return transitionDsar(tx, dsar, { from: ['APPROVED', 'DELIVERED'], to: 'DELIVERED', actorId: staffId(request), notes: `Download link issued, expires ${token.expiresAt.toISOString()}`, data: { expiresAt: token.expiresAt, exportUrl: null } });
      });
      await writeInternalAudit(request, 'compliance.dsar.deliver', 'dsar_request', dsar.id, { status: dsar.status }, { status: after.status, exportId: ready.id, expiresAt: token.expiresAt.toISOString() }, reason, { targetTenantId: dsar.tenantId });
      await dsarActivity(request, dsar, 'dsar.delivered', `${dsar.requestType} request delivered to the tenant`);
      const link = tenantDownloadLink(dsar.id, token.token);
      await notifyTenantAdmins(app, {
        tenantId: dsar.tenantId,
        event: 'dsar.ready',
        title: 'Your data request is ready',
        body: `The ${dsar.requestType.toLowerCase()} request for ${dsar.requesterEmail} can be downloaded once, until ${token.expiresAt.toISOString().slice(0, 10)}.`,
        link,
        email: { template: 'dsar_ready', data: { requestType: dsar.requestType.toLowerCase(), subjectEmail: dsar.requesterEmail, link } }
      });
      return reply.send({ dsar: presentDsar(after, null), tokenExpiresAt: token.expiresAt.toISOString() });
    } catch (error) {
      return dsarErrorReply(reply, error);
    }
  });

  app.post('/api/internal/compliance/dsar/:id/erase', danger('trust.compliance.dsar.deliver'), async (request, reply) => {
    const { id } = request.params as { id: string };
    const reason = (request.body as { reason?: string } | undefined)?.reason ?? null;
    try {
      const dsar = await loadDsar(id);
      if (dsar.requestType !== 'ERASURE') return reply.status(409).send({ error: 'NOT_ERASURE', message: 'Only erasure requests can be erased.' });
      const hold = await activeLegalHoldForTenant(app.prisma, dsar.tenantId);
      if (hold) return reply.status(409).send({ error: 'LEGAL_HOLD_ACTIVE', message: `An active legal hold blocks erasure: ${hold.reason}`, holdId: hold.id });
      const after = await transitionDsar(app.prisma, dsar, { from: ['IDENTITY_VERIFIED', 'DATA_GATHERED', 'APPROVED'], to: 'ERASING', actorId: staffId(request), notes: reason });
      try {
        await scheduledJobsQueue.add(DSAR_ERASE_JOB, { dsarId: dsar.id, tenantId: dsar.tenantId }, { jobId: `${DSAR_ERASE_JOB}:${dsar.id}:${Date.now()}`, removeOnComplete: 100, removeOnFail: 100 });
      } catch (error) {
        request.log.error({ err: error, dsarId: dsar.id }, 'Failed to queue DSAR erasure');
        await transitionDsar(app.prisma, after, { from: ['ERASING'], to: dsar.status, actorId: staffId(request), notes: 'Erasure could not be queued' });
        return reply.status(503).send({ error: 'QUEUE_UNAVAILABLE', message: 'The erasure job could not be queued; nothing changed. Try again shortly.' });
      }
      await writeInternalAudit(request, 'compliance.dsar.erase', 'dsar_request', dsar.id, { status: dsar.status }, { status: after.status }, reason, { targetTenantId: dsar.tenantId });
      return reply.status(202).send({ dsar: presentDsar(after, null) });
    } catch (error) {
      return dsarErrorReply(reply, error);
    }
  });

  app.post('/api/internal/compliance/dsar/:id/close', write('trust.compliance.dsar.write'), async (request, reply) => {
    const parsed = closeBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    try {
      const dsar = await loadDsar(id);
      const after = await transitionDsar(app.prisma, dsar, { from: ['RECEIVED', 'IDENTITY_VERIFIED', 'DATA_GATHERED', 'APPROVED', 'DELIVERED', 'ERASED'], to: 'CLOSED', actorId: staffId(request), notes: parsed.data.reason, data: { closedAt: new Date() } });
      await writeInternalAudit(request, 'compliance.dsar.close', 'dsar_request', dsar.id, { status: dsar.status }, { status: after.status }, parsed.data.reason, { targetTenantId: dsar.tenantId });
      return reply.send({ dsar: presentDsar(after, null) });
    } catch (error) {
      return dsarErrorReply(reply, error);
    }
  });

  app.get('/api/internal/compliance/legal-holds', read('trust.compliance.legal-hold.read'), async (request, reply) => {
    const parsed = listHolds.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const rows = await app.prisma.legalHold.findMany({
      where: { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    const tenants = await tenantLabels(app, rows.map((row) => row.tenantId));
    return reply.send({ data: rows.map((row) => presentHold(row, label(tenants, row.tenantId))) });
  });

  app.post('/api/internal/compliance/legal-holds', danger('trust.compliance.legal-hold.write'), async (request, reply) => {
    const parsed = createHold.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const input = parsed.data;
    if (input.appliesToAllTenants) {
      if (!(await requireJitRoot(request, reply))) return reply;
      const hold = await app.prisma.legalHold.create({ data: { tenantId: null, appliesToAllTenants: true, scope: (input.scope ?? {}) as Prisma.InputJsonObject, reason: input.reason, status: 'ACTIVE', createdBy: staffId(request) } });
      await writeInternalAudit(request, 'compliance.legal_hold.create', 'legal_hold', hold.id, null, { status: hold.status, appliesToAllTenants: true }, input.reason);
      await recordAndPublishActivity(activityDeps(app, request), {
        service: 'trust.compliance',
        type: 'legal_hold.created',
        ...staffActor(request),
        subjectType: 'legal_hold',
        subjectId: hold.id,
        summary: 'Legal hold placed on every tenant',
        severity: 'CRITICAL',
        consoleLink: '/trust/compliance/legal-hold',
        metadata: { appliesToAllTenants: true, jitSessionId: request.jitSessionId ?? null },
        dedupeKey: `legal_hold.created:${hold.id}`
      });
      return reply.status(201).send({ hold: presentHold(hold, null) });
    }
    const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId! }, select: { id: true, name: true, slug: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const hold = await app.prisma.legalHold.create({ data: { tenantId: tenant.id, scope: (input.scope ?? {}) as Prisma.InputJsonObject, reason: input.reason, status: 'ACTIVE', createdBy: staffId(request) } });
    await writeInternalAudit(request, 'compliance.legal_hold.create', 'legal_hold', hold.id, null, { status: hold.status, tenantId: tenant.id }, input.reason, { targetTenantId: tenant.id });
    await recordAndPublishActivity(activityDeps(app, request), {
      service: 'trust.compliance',
      type: 'legal_hold.created',
      tenantId: tenant.id,
      ...staffActor(request),
      subjectType: 'legal_hold',
      subjectId: hold.id,
      summary: `Legal hold placed on ${tenant.name}`,
      severity: 'ATTENTION',
      consoleLink: '/trust/compliance/legal-hold',
      dedupeKey: `legal_hold.created:${hold.id}`
    });
    return reply.status(201).send({ hold: presentHold(hold, tenant) });
  });

  app.post('/api/internal/compliance/legal-holds/:id/release', danger('trust.compliance.legal-hold.write'), async (request, reply) => {
    const parsed = releaseHold.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    const hold = await app.prisma.legalHold.findUnique({ where: { id } });
    if (!hold) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Legal hold not found' });
    if (hold.appliesToAllTenants && !(await requireJitRoot(request, reply))) return reply;
    const released = await app.prisma.legalHold.updateMany({
      where: { id: hold.id, tenantId: hold.tenantId, status: 'ACTIVE' },
      data: { status: 'RELEASED', releasedBy: staffId(request), releasedAt: new Date(), releaseReason: parsed.data.reason }
    });
    if (released.count !== 1) return reply.status(409).send({ error: 'ALREADY_RELEASED', message: 'This hold was already released.' });
    const after = await app.prisma.legalHold.findUniqueOrThrow({ where: { id: hold.id } });
    await writeInternalAudit(request, 'compliance.legal_hold.release', 'legal_hold', hold.id, { status: hold.status }, { status: after.status, releaseReason: after.releaseReason }, parsed.data.reason, hold.tenantId ? { targetTenantId: hold.tenantId } : {});
    const tenants = await tenantLabels(app, [hold.tenantId]);
    await recordAndPublishActivity(activityDeps(app, request), {
      service: 'trust.compliance',
      type: 'legal_hold.released',
      tenantId: hold.tenantId,
      ...staffActor(request),
      subjectType: 'legal_hold',
      subjectId: hold.id,
      summary: `Legal hold released${hold.appliesToAllTenants ? ' on every tenant' : hold.tenantId ? ` on ${label(tenants, hold.tenantId)?.name}` : ''}`,
      consoleLink: '/trust/compliance/legal-hold',
      dedupeKey: `legal_hold.released:${hold.id}`
    });
    return reply.send({ hold: presentHold(after, label(tenants, hold.tenantId)) });
  });

  app.get('/api/internal/compliance/exports', read('trust.compliance.dsar.read'), async (request, reply) => {
    const parsed = listExports.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const rows = await app.prisma.complianceExport.findMany({
      where: { ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}), ...(parsed.data.dsarId ? { dsarId: parsed.data.dsarId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    const tenants = await tenantLabels(app, rows.map((row) => row.tenantId));
    return reply.send({ data: rows.map((row) => presentExport(row, label(tenants, row.tenantId))) });
  });
}
