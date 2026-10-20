import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FraudSignal, Prisma, SuspensionRecord, TenantAppeal } from '@prisma/client';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { SuspensionError, liftSuspension, staffSuspensionActor, suspendTenant } from '../../../services/tenant-suspension.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { notifyTenantAdmins } from '../../../services/platform-notifier.service.js';
import { safetyRules } from '../../../config/safety-rules.js';
import { writeInternalAudit } from '../internal-audit.js';

// trust.safety (WP-2.4, L3). Fraud and AUP signals (one table, `category`), every suspension cause (D3), and the appeal
// loop: the tenant appeals from the suspension overlay, staff approve (lifts the linked cause via APPEAL), reject (the
// resolution shows in the overlay) or ask a question (the tenant answers from the overlay). Every decision is
// dangerous (fresh MFA + reason), audited, recorded as activity and sent to the tenant's admins.

const CATEGORIES = ['FRAUD', 'AUP'] as const;
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const OPEN_APPEAL = ['OPEN', 'PENDING', 'INFO_REQUESTED'];

const listSignals = z.object({
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional()
});
const createSignal = z.object({
  tenantId: z.string().min(1),
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES).default('MEDIUM'),
  summary: z.string().trim().min(10, 'Describe what was reported (at least 10 characters).').max(2000),
  evidenceUrl: z.string().url().optional(),
  reason: z.string().trim().min(8).optional()
});
const signalDecision = z
  .object({
    decision: z.enum(['DISMISS', 'WARN', 'SUSPEND']),
    reason: z.string().trim().min(8),
    // WARN: what the tenant admins are told. SUSPEND: the reason shown in the tenant's suspension overlay.
    tenantMessage: z.string().trim().min(10).max(2000).optional()
  })
  .refine((value) => value.decision !== 'WARN' || Boolean(value.tenantMessage), { message: 'A warning needs the message the tenant will see.', path: ['tenantMessage'] });
const listSuspensions = z.object({
  source: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'LIFTED']).optional(),
  category: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional()
});
const liftBody = z.object({ reason: z.string().trim().min(8) });
const listAppeals = z.object({
  status: z.enum(['PENDING', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'OPEN']).optional(),
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional()
});
const appealDecision = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_INFO']),
    reason: z.string().trim().min(8),
    // Shown to the tenant: the resolution (APPROVE/REJECT) or the question (REQUEST_INFO).
    message: z.string().trim().min(10).max(4000).optional()
  })
  .refine((value) => value.decision === 'APPROVE' || Boolean(value.message), { message: 'Rejecting or asking for information needs the text the tenant will see.', path: ['message'] });

function validation(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: 'VALIDATION', message: error.issues.map((issue) => issue.message).join(' ') });
}

const read = { preHandler: [authenticatePlatformSession, requireConsolePermission('trust.safety.read')] };
const write = { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('trust.safety.suspend')] };
const danger = { preHandler: dangerous('trust.safety.suspend') };

type TenantLabel = { id: string; name: string; slug: string; status: string };

async function tenantLabels(app: FastifyInstance, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, TenantLabel>();
  const tenants = await app.prisma.tenant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, slug: true, status: true } });
  return new Map(tenants.map((tenant) => [tenant.id, tenant]));
}

function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null };
}

function presentSignal(signal: FraudSignal, tenant: TenantLabel | undefined) {
  return {
    id: signal.id,
    tenant: tenant ?? { id: signal.tenantId, name: signal.tenantId, slug: signal.tenantId, status: 'UNKNOWN' },
    source: signal.source,
    signalType: signal.signalType,
    category: signal.category,
    severity: signal.severity,
    status: signal.status,
    decision: signal.decision,
    decisionNote: signal.decisionNote,
    decidedAt: signal.decidedAt?.toISOString() ?? null,
    summary: summaryOf(signal),
    createdAt: signal.createdAt.toISOString()
  };
}

function summaryOf(signal: FraudSignal) {
  const payload = signal.payload && typeof signal.payload === 'object' && !Array.isArray(signal.payload) ? (signal.payload as Record<string, unknown>) : {};
  return typeof payload.summary === 'string' ? payload.summary : signal.signalType.replace(/[._]/g, ' ');
}

function presentAppeal(appeal: TenantAppeal, tenant: TenantLabel | undefined, suspension: SuspensionRecord | null) {
  return {
    id: appeal.id,
    tenant: tenant ?? { id: appeal.tenantId, name: appeal.tenantId, slug: appeal.tenantId, status: 'UNKNOWN' },
    status: appeal.status === 'OPEN' ? 'PENDING' : appeal.status,
    message: appeal.message,
    contactEmail: appeal.contactEmail,
    infoRequest: appeal.infoRequest,
    infoRequestedAt: appeal.infoRequestedAt?.toISOString() ?? null,
    tenantReply: appeal.tenantReply,
    tenantRepliedAt: appeal.tenantRepliedAt?.toISOString() ?? null,
    resolution: appeal.reviewNote ?? null,
    decidedAt: appeal.decidedAt?.toISOString() ?? null,
    createdAt: appeal.createdAt.toISOString(),
    suspension: suspension
      ? { id: suspension.id, source: suspension.source, category: suspension.category, status: suspension.status, reason: suspension.reason, publicReason: suspension.publicReason, createdAt: suspension.createdAt.toISOString() }
      : null
  };
}

function suspensionErrorReply(reply: FastifyReply, error: unknown) {
  if (error instanceof SuspensionError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

function activityDeps(app: FastifyInstance, request: FastifyRequest) {
  return { prisma: app.prisma, redis: app.redis, log: request.log };
}

export async function registerConsoleSafetyRoutes(app: FastifyInstance) {
  app.get('/api/internal/safety/signals', read, async (request, reply) => {
    const parsed = listSignals.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const query = parsed.data;
    const where: Prisma.FraudSignalWhereInput = { ...(query.category ? { category: query.category } : {}), ...(query.status ? { status: query.status } : {}), ...(query.tenantId ? { tenantId: query.tenantId } : {}) };
    const rows = await app.prisma.fraudSignal.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
    const result = page(rows, query.limit);
    const tenants = await tenantLabels(app, result.data.map((row) => row.tenantId));
    return reply.send({ data: result.data.map((row) => presentSignal(row, tenants.get(row.tenantId))), nextCursor: result.nextCursor });
  });

  // A manual fraud flag or an acceptable-use report (AUP = a signal with category AUP).
  app.post('/api/internal/safety/signals', write, async (request, reply) => {
    const parsed = createSignal.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const input = parsed.data;
    const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, name: true, slug: true, status: true } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    const signal = await app.prisma.fraudSignal.create({
      data: {
        tenantId: tenant.id,
        source: input.category === 'AUP' ? 'aup_report' : 'manual',
        signalType: input.category === 'AUP' ? 'aup_report' : 'manual_flag',
        category: input.category,
        severity: input.severity,
        payload: { summary: input.summary, evidenceUrl: input.evidenceUrl ?? null, reportedBy: request.platform!.user.email }
      }
    });
    await writeInternalAudit(request, input.category === 'AUP' ? 'safety.aup.report' : 'safety.fraud.flag', 'fraud_signal', signal.id, null, { category: signal.category, severity: signal.severity }, input.reason ?? null, { targetTenantId: tenant.id });
    await recordAndPublishActivity(activityDeps(app, request), {
      service: 'trust.safety',
      type: input.category === 'AUP' ? 'aup.reported' : 'fraud.flagged',
      tenantId: tenant.id,
      ...staffActor(request),
      subjectType: 'fraud_signal',
      subjectId: signal.id,
      summary: `${input.category === 'AUP' ? 'AUP report' : 'Fraud flag'} on ${tenant.name}: ${input.summary.slice(0, 120)}`,
      severity: input.severity === 'HIGH' || input.severity === 'CRITICAL' ? 'ATTENTION' : 'INFO',
      consoleLink: `/trust/safety/signals?signal=${signal.id}`,
      dedupeKey: `signal.created:${signal.id}`
    });
    return reply.status(201).send({ signal: presentSignal(signal, tenant) });
  });

  app.post('/api/internal/safety/signals/:id/decision', danger, async (request, reply) => {
    const parsed = signalDecision.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const input = parsed.data;
    const { id } = request.params as { id: string };
    const signal = await app.prisma.fraudSignal.findUnique({ where: { id } });
    if (!signal) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Signal not found' });
    if (signal.status === 'CLOSED') return reply.status(409).send({ error: 'ALREADY_DECIDED', message: `This signal was already decided (${signal.decision ?? 'closed'}).` });
    const tenants = await tenantLabels(app, [signal.tenantId]);
    const tenant = tenants.get(signal.tenantId);

    let suspensionId: string | null = null;
    if (input.decision === 'SUSPEND') {
      try {
        const result = await suspendTenant(app, {
          tenantId: signal.tenantId,
          source: signal.category === 'AUP' ? 'AUP' : 'FRAUD',
          category: signal.category === 'AUP' ? 'AUP' : 'FRAUD',
          reason: input.reason,
          publicReason: input.tenantMessage ?? null,
          actor: staffSuspensionActor(request),
          sourceRef: signal.id,
          sourceSignalId: signal.id
        });
        suspensionId = result.record.id;
      } catch (error) {
        return suspensionErrorReply(reply, error);
      }
    }
    const decided = await app.prisma.fraudSignal.update({
      where: { id: signal.id },
      data: { status: 'CLOSED', decision: input.decision, decisionNote: input.reason, decidedAt: new Date(), reviewedBy: request.platform!.user.id }
    });
    if (input.decision === 'WARN') {
      await notifyTenantAdmins(app, {
        tenantId: signal.tenantId,
        event: 'safety.warning',
        title: signal.category === 'AUP' ? 'Acceptable use warning from Fauward' : 'Account warning from Fauward',
        body: input.tenantMessage,
        link: '/'
      });
    }
    await writeInternalAudit(request, 'safety.signal.decision', 'fraud_signal', signal.id, { status: signal.status }, { status: decided.status, decision: input.decision, suspensionId }, input.reason, { targetTenantId: signal.tenantId });
    await recordAndPublishActivity(activityDeps(app, request), {
      service: 'trust.safety',
      type: 'signal.decided',
      tenantId: signal.tenantId,
      ...staffActor(request),
      subjectType: 'fraud_signal',
      subjectId: signal.id,
      summary: `${signal.category} signal on ${tenant?.name ?? signal.tenantId}: ${input.decision.toLowerCase()}`,
      severity: input.decision === 'SUSPEND' ? 'ATTENTION' : 'INFO',
      consoleLink: `/trust/safety/signals?signal=${signal.id}`,
      dedupeKey: `signal.decided:${signal.id}`,
      metadata: { decision: input.decision, suspensionId }
    });
    return reply.send({ signal: presentSignal(decided, tenant), suspensionId });
  });

  // Every SuspensionRecord from every source (D3), with filters and the tenant for each row (ACC-SAF-5).
  app.get('/api/internal/safety/suspensions', read, async (request, reply) => {
    const parsed = listSuspensions.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const query = parsed.data;
    const rows = await app.prisma.suspensionRecord.findMany({
      where: {
        ...(query.source ? { source: query.source.toUpperCase() } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category.toUpperCase() } : {}),
        ...(query.tenantId ? { tenantId: query.tenantId } : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const result = page(rows, query.limit);
    const tenants = await tenantLabels(app, result.data.map((row) => row.tenantId));
    return reply.send({ data: result.data.map((row) => ({ ...row, tenant: tenants.get(row.tenantId) ?? null })), nextCursor: result.nextCursor });
  });

  app.post('/api/internal/safety/suspensions/:id/lift', danger, async (request, reply) => {
    const parsed = liftBody.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const { id } = request.params as { id: string };
    const record = await app.prisma.suspensionRecord.findUnique({ where: { id } });
    if (!record) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Suspension not found' });
    try {
      const result = await liftSuspension(app, { tenantId: record.tenantId, suspensionId: record.id, via: 'MANUAL', reason: parsed.data.reason, actor: staffSuspensionActor(request) });
      return reply.send({ lifted: result.lifted, remaining: result.remaining.length, tenantStatus: result.tenant.status });
    } catch (error) {
      return suspensionErrorReply(reply, error);
    }
  });

  app.get('/api/internal/safety/appeals', read, async (request, reply) => {
    const parsed = listAppeals.safeParse(request.query ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const query = parsed.data;
    const status = query.status === 'PENDING' ? { in: ['PENDING', 'OPEN'] } : query.status;
    const rows = await app.prisma.tenantAppeal.findMany({
      where: { ...(status ? { status } : {}), ...(query.tenantId ? { tenantId: query.tenantId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const result = page(rows, query.limit);
    const [tenants, suspensions] = await Promise.all([
      tenantLabels(app, result.data.map((row) => row.tenantId)),
      app.prisma.suspensionRecord.findMany({ where: { id: { in: result.data.map((row) => row.suspensionId).filter((value): value is string => Boolean(value)) } } })
    ]);
    const suspensionById = new Map(suspensions.map((row) => [row.id, row]));
    return reply.send({
      data: result.data.map((row) => presentAppeal(row, tenants.get(row.tenantId), row.suspensionId ? suspensionById.get(row.suspensionId) ?? null : null)),
      nextCursor: result.nextCursor
    });
  });

  app.get('/api/internal/safety/appeals/:id', read, async (request, reply) => {
    const { id } = request.params as { id: string };
    const appeal = await app.prisma.tenantAppeal.findUnique({ where: { id } });
    if (!appeal) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Appeal not found' });
    const [tenants, suspension, activeSuspensions, previousAppeals] = await Promise.all([
      tenantLabels(app, [appeal.tenantId]),
      appeal.suspensionId ? app.prisma.suspensionRecord.findFirst({ where: { id: appeal.suspensionId, tenantId: appeal.tenantId } }) : null,
      app.prisma.suspensionRecord.findMany({ where: { tenantId: appeal.tenantId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
      app.prisma.tenantAppeal.count({ where: { tenantId: appeal.tenantId, id: { not: appeal.id } } })
    ]);
    return reply.send({
      appeal: presentAppeal(appeal, tenants.get(appeal.tenantId), suspension),
      context: {
        activeSuspensions: activeSuspensions.map((row) => ({ id: row.id, source: row.source, category: row.category, reason: row.reason, publicReason: row.publicReason, createdAt: row.createdAt.toISOString() })),
        previousAppeals
      }
    });
  });

  app.post('/api/internal/safety/appeals/:id/decision', danger, async (request, reply) => {
    const parsed = appealDecision.safeParse(request.body ?? {});
    if (!parsed.success) return validation(reply, parsed.error);
    const input = parsed.data;
    const { id } = request.params as { id: string };
    const appeal = await app.prisma.tenantAppeal.findUnique({ where: { id } });
    if (!appeal) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Appeal not found' });
    if (!OPEN_APPEAL.includes(appeal.status)) return reply.status(409).send({ error: 'ALREADY_DECIDED', message: `This appeal was already ${appeal.status.toLowerCase()}.` });
    const tenants = await tenantLabels(app, [appeal.tenantId]);
    const tenantName = tenants.get(appeal.tenantId)?.name ?? appeal.tenantId;
    const now = new Date();

    let becameActive = false;
    if (input.decision === 'APPROVE') {
      // The suspension comes from the appeal (set server-side at creation), never from the client (D3).
      const linked = appeal.suspensionId ? await app.prisma.suspensionRecord.findFirst({ where: { id: appeal.suspensionId, tenantId: appeal.tenantId } }) : null;
      if (linked?.status === 'ACTIVE') {
        try {
          const result = await liftSuspension(app, { tenantId: appeal.tenantId, suspensionId: linked.id, via: 'APPEAL', reason: input.reason, actor: staffSuspensionActor(request) });
          becameActive = result.becameActive;
        } catch (error) {
          return suspensionErrorReply(reply, error);
        }
      }
    }

    const updated = await app.prisma.tenantAppeal.update({
      where: { id: appeal.id },
      data:
        input.decision === 'REQUEST_INFO'
          ? { status: 'INFO_REQUESTED', infoRequest: input.message, infoRequestedAt: now, tenantReply: null, tenantRepliedAt: null }
          : {
              status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
              resolvedBy: request.platform!.user.id,
              resolution: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
              reviewNote: input.message ?? null,
              decidedAt: now
            }
    });
    await writeInternalAudit(request, 'safety.appeal.decision', 'tenant_appeal', appeal.id, { status: appeal.status }, { status: updated.status, decision: input.decision }, input.reason, { targetTenantId: appeal.tenantId });
    await recordAndPublishActivity(activityDeps(app, request), {
      service: 'trust.safety',
      type: input.decision === 'REQUEST_INFO' ? 'appeal.info_requested' : 'appeal.decided',
      tenantId: appeal.tenantId,
      ...staffActor(request),
      subjectType: 'appeal',
      subjectId: appeal.id,
      summary: input.decision === 'REQUEST_INFO' ? `Asked ${tenantName} for more information on its appeal` : `${tenantName}'s appeal ${input.decision === 'APPROVE' ? 'approved' : 'rejected'}`,
      severity: 'INFO',
      consoleLink: `/trust/safety/appeals/${appeal.id}`,
      dedupeKey: `appeal.${input.decision.toLowerCase()}:${appeal.id}:${now.getTime()}`,
      metadata: { decision: input.decision, becameActive }
    });
    await notifyTenantAdmins(app, {
      tenantId: appeal.tenantId,
      event: input.decision === 'REQUEST_INFO' ? 'appeal.info_requested' : 'appeal.decided',
      title: input.decision === 'REQUEST_INFO' ? 'Fauward needs more information about your appeal' : input.decision === 'APPROVE' ? 'Your appeal was approved' : 'Your appeal was rejected',
      body: input.message,
      link: '/',
      email: { template: 'appeal_decided', data: { decision: input.decision === 'REQUEST_INFO' ? 'INFORMATION REQUESTED' : input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', resolution: input.message } }
    });
    const suspension = updated.suspensionId ? await app.prisma.suspensionRecord.findFirst({ where: { id: updated.suspensionId, tenantId: updated.tenantId } }) : null;
    return reply.send({ appeal: presentAppeal(updated, tenants.get(appeal.tenantId), suspension), tenantReactivated: becameActive });
  });

  // Code-defined automatic rules, read-only (ACC-SAF-6).
  app.get('/api/internal/safety/rules', read, async (_request, reply) => reply.send({ data: safetyRules() }));
}
