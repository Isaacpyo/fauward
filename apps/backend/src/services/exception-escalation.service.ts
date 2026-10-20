import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ExceptionCase, ExceptionEscalationReply, Prisma } from '@prisma/client';
import { z } from 'zod';
import { recordAndPublishActivity, staffActor, type ActivityInput } from './platform-activity.service.js';
import { notifyStaff, notifyTenantAdmins, notifyTenantUser } from './platform-notifier.service.js';
import { writePlatformAuditLog } from './platform-audit.service.js';
import { platformAuditActor } from '../modules/internal/request-meta.js';

// L15 (WP-2.11): a tenant escalates an exception case to Fauward → CRITICAL activity + staff notification → console
// Escalations page (assign / reply / resolve) → the tenant sees replies and the status on its exceptions page and gets
// in-app + email notices. Console requests run in system context, so every per-tenant query names the tenant.

export const ESCALATION_STATUSES = ['OPEN', 'RESOLVED', 'ALL'] as const;
export const escalateBody = z.object({ reason: z.string().trim().min(10).max(2000) });
export const escalationPatchBody = z
  .object({
    /** Platform user id, or null to unassign. */
    platformAssigneeId: z.string().min(1).nullable().optional(),
    /** A reply the tenant sees on its exceptions page. */
    reply: z.string().trim().min(1).max(5000).optional(),
    /** Resolve the escalation (an optional reply goes out first). */
    resolve: z.literal(true).optional()
  })
  .refine((body) => body.platformAssigneeId !== undefined || body.reply !== undefined || body.resolve === true, 'Nothing to change: assign, reply or resolve');
export const escalationListQuery = z.object({
  status: z.enum(ESCALATION_STATUSES).default('OPEN'),
  tenantId: z.string().min(1).optional(),
  assignedToMe: z.enum(['true', 'false']).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export class EscalationError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type EscalationRow = ExceptionCase & { escalationReplies?: ExceptionEscalationReply[] };

export function escalationState(row: Pick<ExceptionCase, 'escalatedAt' | 'platformResolvedAt'>) {
  if (!row.escalatedAt) return 'NOT_ESCALATED' as const;
  return row.platformResolvedAt ? ('RESOLVED' as const) : ('OPEN' as const);
}

/** The escalation part of an exception, as the tenant sees it (staff ids are not exposed). */
export function presentTenantEscalation(row: EscalationRow) {
  return {
    state: escalationState(row),
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    reason: row.escalationReason,
    resolvedAt: row.platformResolvedAt?.toISOString() ?? null,
    replies: (row.escalationReplies ?? []).map((reply) => ({ id: reply.id, author: `${reply.authorName} (Fauward)`, body: reply.body, createdAt: reply.createdAt.toISOString() }))
  };
}

function activityDeps(app: FastifyInstance) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

const consoleLink = (id: string) => `/platform/incidents/escalations?id=${encodeURIComponent(id)}`;

/** Tenant side: escalate an exception case of the caller's tenant. One open escalation per case. */
export async function escalateException(
  app: FastifyInstance,
  input: { tenantId: string; exceptionId: string; userId: string; userLabel: string; reason: string }
) {
  const existing = await app.prisma.exceptionCase.findFirst({ where: { id: input.exceptionId, tenantId: input.tenantId }, include: { tenant: { select: { name: true } }, shipment: { select: { trackingNumber: true } } } });
  if (!existing) throw new EscalationError(404, 'NOT_FOUND', 'Exception not found');
  if (escalationState(existing) === 'OPEN') throw new EscalationError(409, 'ALREADY_ESCALATED', 'This exception is already escalated to Fauward.');
  const now = new Date();
  // Guarded write: two concurrent escalations cannot both succeed.
  const claimed = await app.prisma.exceptionCase.updateMany({
    where: { id: existing.id, tenantId: input.tenantId, OR: [{ escalatedAt: null }, { platformResolvedAt: { not: null } }] },
    data: { escalatedAt: now, escalatedByUserId: input.userId, escalationReason: input.reason, platformAssigneeId: null, platformResolvedAt: null }
  });
  if (claimed.count !== 1) throw new EscalationError(409, 'ALREADY_ESCALATED', 'This exception is already escalated to Fauward.');
  const subject = existing.shipment?.trackingNumber ? `${existing.type} on ${existing.shipment.trackingNumber}` : existing.type;
  await recordAndPublishActivity(activityDeps(app), {
    service: 'platform.incidents',
    type: 'exception.escalated',
    tenantId: input.tenantId,
    actorType: 'TENANT_USER',
    actorId: input.userId,
    actorLabel: input.userLabel,
    subjectType: 'exception_case',
    subjectId: existing.id,
    summary: `${existing.tenant.name} escalated ${subject}: ${input.reason.slice(0, 140)}`,
    severity: 'CRITICAL',
    consoleLink: consoleLink(existing.id),
    dedupeKey: `exception.escalated:${existing.id}:${now.toISOString()}`
  });
  await notifyStaff(app, {
    permission: 'platform.incidents.write',
    event: 'exception.escalated',
    title: `${existing.tenant.name} escalated an exception`,
    body: `${subject}: ${input.reason.slice(0, 200)}`,
    link: consoleLink(existing.id),
    severity: 'CRITICAL',
    tenantId: input.tenantId
  });
  return { id: existing.id };
}

const escalationInclude = {
  tenant: { select: { id: true, name: true, slug: true } },
  shipment: { select: { id: true, trackingNumber: true, status: true } },
  escalationReplies: { orderBy: { createdAt: 'asc' } }
} satisfies Prisma.ExceptionCaseInclude;

type ConsoleEscalationRow = Prisma.ExceptionCaseGetPayload<{ include: typeof escalationInclude }>;

export function presentConsoleEscalation(row: ConsoleEscalationRow) {
  return {
    id: row.id,
    tenant: row.tenant,
    shipment: row.shipment,
    type: row.type,
    severity: row.severity,
    status: row.status,
    state: escalationState(row),
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    escalatedByUserId: row.escalatedByUserId,
    reason: row.escalationReason,
    platformAssigneeId: row.platformAssigneeId,
    platformResolvedAt: row.platformResolvedAt?.toISOString() ?? null,
    replies: row.escalationReplies.map((reply) => ({ id: reply.id, platformUserId: reply.platformUserId, authorName: reply.authorName, body: reply.body, createdAt: reply.createdAt.toISOString() })),
    createdAt: row.createdAt.toISOString()
  };
}

export async function listEscalations(app: FastifyInstance, query: z.infer<typeof escalationListQuery>, platformUserId: string) {
  const where: Prisma.ExceptionCaseWhereInput = {
    escalatedAt: { not: null },
    ...(query.status === 'OPEN' ? { platformResolvedAt: null } : query.status === 'RESOLVED' ? { platformResolvedAt: { not: null } } : {}),
    ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    ...(query.assignedToMe === 'true' ? { platformAssigneeId: platformUserId } : {})
  };
  const [rows, total] = await Promise.all([
    app.prisma.exceptionCase.findMany({
      where,
      include: escalationInclude,
      orderBy: [{ escalatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    }),
    app.prisma.exceptionCase.count({ where })
  ]);
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return { data: page.map(presentConsoleEscalation), total, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
}

export async function getEscalation(app: FastifyInstance, id: string) {
  const row = await app.prisma.exceptionCase.findFirst({ where: { id, escalatedAt: { not: null } }, include: escalationInclude });
  return row ? presentConsoleEscalation(row) : null;
}

/** Console side: assign, reply to the tenant and/or resolve. Each change audits and records activity. */
export async function updateEscalation(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof escalationPatchBody>) {
  const staff = request.platform!.user;
  const found = await app.prisma.exceptionCase.findFirst({ where: { id, escalatedAt: { not: null } }, include: escalationInclude });
  if (!found) throw new EscalationError(404, 'NOT_FOUND', 'Escalation not found');
  const tenantId = found.tenantId;
  if (found.platformResolvedAt && (body.reply !== undefined || body.resolve)) throw new EscalationError(409, 'ALREADY_RESOLVED', 'This escalation is resolved; the tenant can escalate again.');
  const base: Pick<ActivityInput, 'service' | 'tenantId' | 'subjectType' | 'subjectId' | 'consoleLink'> = {
    service: 'platform.incidents',
    tenantId,
    subjectType: 'exception_case',
    subjectId: found.id,
    consoleLink: consoleLink(found.id)
  };
  const subject = found.shipment?.trackingNumber ? `${found.type} on ${found.shipment.trackingNumber}` : found.type;
  const tenantLink = `/exceptions?id=${encodeURIComponent(found.id)}`;

  if (body.platformAssigneeId !== undefined) {
    if (body.platformAssigneeId !== null) {
      const assignee = await app.prisma.platformUser.findUnique({ where: { id: body.platformAssigneeId }, select: { id: true, status: true } });
      if (!assignee || assignee.status !== 'ACTIVE') throw new EscalationError(400, 'INVALID_ASSIGNEE', 'Assignee must be an active console user');
    }
    await app.prisma.exceptionCase.updateMany({ where: { id: found.id, tenantId }, data: { platformAssigneeId: body.platformAssigneeId } });
    await writePlatformAuditLog(app.prisma, { ...platformAuditActor(request), actorType: 'PLATFORM_USER', action: 'EXCEPTION_ESCALATION_ASSIGNED', targetTenantId: tenantId, reason: null, metadata: { exceptionId: found.id, from: found.platformAssigneeId, to: body.platformAssigneeId } });
  }

  if (body.reply !== undefined) {
    const authorName = staff.name ?? staff.email;
    await app.prisma.exceptionEscalationReply.create({ data: { tenantId, exceptionId: found.id, platformUserId: staff.id, authorName, body: body.reply } });
    await recordAndPublishActivity(activityDeps(app), { ...base, type: 'exception.escalation_replied', ...staffActor(request), summary: `${found.tenant.name}: Fauward replied on ${subject}` });
    const notice = { tenantId, event: 'exception.escalation_replied', title: `Fauward replied on your escalated exception`, body: `${subject}: ${body.reply.slice(0, 200)}`, link: tenantLink, email: { template: 'exception_escalation_update' as const, data: { subject, reply: body.reply, status: 'replied' } } };
    await notifyEscalationRecipients(app, found.escalatedByUserId, notice);
  }

  if (body.resolve) {
    const now = new Date();
    const resolved = await app.prisma.exceptionCase.updateMany({ where: { id: found.id, tenantId, platformResolvedAt: null }, data: { platformResolvedAt: now } });
    if (resolved.count === 1) {
      await writePlatformAuditLog(app.prisma, { ...platformAuditActor(request), actorType: 'PLATFORM_USER', action: 'EXCEPTION_ESCALATION_RESOLVED', targetTenantId: tenantId, reason: null, metadata: { exceptionId: found.id } });
      await recordAndPublishActivity(activityDeps(app), { ...base, type: 'exception.escalation_resolved', ...staffActor(request), summary: `${found.tenant.name}: escalation of ${subject} resolved` });
      const notice = { tenantId, event: 'exception.escalation_resolved', title: 'Fauward resolved your escalated exception', body: subject, link: tenantLink, email: { template: 'exception_escalation_update' as const, data: { subject, status: 'resolved' } } };
      await notifyEscalationRecipients(app, found.escalatedByUserId, notice);
    }
  }

  return getEscalation(app, found.id);
}

/** The user who escalated, plus every tenant admin (once each). */
async function notifyEscalationRecipients(app: FastifyInstance, escalatedByUserId: string | null, notice: Parameters<typeof notifyTenantAdmins>[1]) {
  await notifyTenantAdmins(app, notice);
  if (!escalatedByUserId) return;
  const escalator = await app.prisma.user.findFirst({ where: { id: escalatedByUserId, tenantId: notice.tenantId }, select: { role: true } });
  if (escalator && escalator.role !== 'TENANT_ADMIN') await notifyTenantUser(app, { ...notice, userId: escalatedByUserId });
}
