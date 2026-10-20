import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { JitAccessRequest, Prisma } from '@prisma/client';
import { z } from 'zod';
import { DEFERRED_PERMISSIONS, PERMISSIONS, type Permission } from '@fauward/internal-rbac';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { consoleUserHas, loadConsoleContext, requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { checkRootHardwareAssertion } from '../../../services/root-grant.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { notifyStaff } from '../../../services/platform-notifier.service.js';
import { writeInternalAudit } from '../internal-audit.js';

// trust.jit (WP-1.7; moved from console-phases.routes.ts). A grant is an APPROVED request with an unexpired expiresAt;
// consolePermissionContext reads grants live on every request, so /auth/me and every requireConsolePermission guard see an
// approval on the next call and stop honouring it the moment it expires or is revoked (ACC-JIT-3, ACC-JIT-4).

export const JIT_MIN_REASON = 20;
export const JIT_MAX_MINUTES = 240;
export const JIT_ROOT_MAX_MINUTES = 60;
const ROOT_PERMISSION: Permission = 'trust.iam.root';
const ROOT_APPROVALS_REQUIRED = 2;

export type JitState = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'DENIED' | 'REVOKED';

const requestBody = z.object({
  permission: z.string().min(1),
  reason: z.string().trim().min(JIT_MIN_REASON, `A reason of at least ${JIT_MIN_REASON} characters is required.`),
  durationMinutes: z.coerce.number().int().min(1).max(JIT_MAX_MINUTES, `Duration cannot exceed ${JIT_MAX_MINUTES} minutes.`).default(60),
  hardwareKeyAssertion: z.string().optional()
});

const denyBody = z.object({ reason: z.string().trim().min(8, 'A reason of at least 8 characters is required; the requester sees it.') });

const historyQuery = z.object({
  state: z.enum(['PENDING', 'ACTIVE', 'EXPIRED', 'DENIED', 'REVOKED']).optional(),
  permission: z.string().min(1).optional(),
  requesterId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional()
});

const requestedPermissions = PERMISSIONS.filter((permission) => !(DEFERRED_PERMISSIONS as readonly string[]).includes(permission));

function isRequestable(value: string): value is Permission {
  return (requestedPermissions as readonly string[]).includes(value);
}

export function jitState(row: Pick<JitAccessRequest, 'status' | 'expiresAt' | 'revokedAt'>, now = new Date()): JitState {
  if (row.status === 'PENDING') return 'PENDING';
  if (row.status === 'DENIED') return 'DENIED';
  if (row.status === 'REVOKED' || row.revokedAt) return 'REVOKED';
  return row.expiresAt && row.expiresAt > now ? 'ACTIVE' : 'EXPIRED';
}

function stateWhere(state: JitState, now: Date): Prisma.JitAccessRequestWhereInput {
  if (state === 'ACTIVE') return { status: 'APPROVED', revokedAt: null, expiresAt: { gt: now } };
  if (state === 'EXPIRED') return { status: 'APPROVED', revokedAt: null, expiresAt: { lte: now } };
  return { status: state };
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: 'VALIDATION', message: error.issues.map((issue) => issue.message).join(' ') });
}

function actor(request: FastifyRequest) {
  return request.platform!.user;
}

function activityDeps(app: FastifyInstance) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

type ApprovalRow = { approverPlatformUserId: string; decision: string; notes: string | null; createdAt: Date };
type RequestRow = JitAccessRequest & { approvals?: ApprovalRow[] };

/** Rows with derived state and the requester/approver identities (PlatformUser is not tenant data). */
async function present(app: FastifyInstance, rows: RequestRow[], viewerId: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.requesterPlatformUserId);
    for (const approval of row.approvals ?? []) ids.add(approval.approverPlatformUserId);
  }
  const users = ids.size > 0 ? await app.prisma.platformUser.findMany({ where: { id: { in: [...ids] } }, select: { id: true, email: true, name: true } }) : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  const label = (id: string) => ({ id, email: byId.get(id)?.email ?? null, name: byId.get(id)?.name ?? null });
  const now = new Date();
  return rows.map((row) => ({
    id: row.id,
    permission: row.permission,
    reason: row.reason,
    durationMinutes: row.durationMinutes,
    status: row.status,
    state: jitState(row, now),
    rootRequest: row.rootRequest,
    approvalsRequired: row.rootRequest ? ROOT_APPROVALS_REQUIRED : 1,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    deniedReason: row.deniedReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ownRequest: row.requesterPlatformUserId === viewerId,
    requester: label(row.requesterPlatformUserId),
    approvals: (row.approvals ?? []).map((approval) => ({ approver: label(approval.approverPlatformUserId), decision: approval.decision, notes: approval.notes, createdAt: approval.createdAt.toISOString() }))
  }));
}

const approvalsInclude = { approvals: { select: { approverPlatformUserId: true, decision: true, notes: true, createdAt: true }, orderBy: { createdAt: 'asc' } } } satisfies Prisma.JitAccessRequestInclude;

/** True when the caller is the requester, by PlatformUser id or by StaffUser id (S3). */
async function isRequester(app: FastifyInstance, request: FastifyRequest, row: Pick<JitAccessRequest, 'requesterPlatformUserId' | 'requesterStaffId'>) {
  if (row.requesterPlatformUserId === actor(request).id) return true;
  if (!row.requesterStaffId) return false;
  const staff = await app.prisma.staffUser.findUnique({ where: { platformUserId: actor(request).id }, select: { id: true } });
  return staff?.id === row.requesterStaffId;
}

export async function registerJitRoutes(app: FastifyInstance) {
  app.post('/api/internal/jit/requests', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('trust.jit.request')] }, async (request, reply) => {
    const parsed = requestBody.safeParse(request.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    if (!isRequestable(body.permission)) return reply.status(400).send({ error: 'UNKNOWN_PERMISSION', message: `${body.permission} is not a requestable permission.` });
    const permission = body.permission;

    const rootRequest = permission === ROOT_PERMISSION;
    if (rootRequest && body.durationMinutes > JIT_ROOT_MAX_MINUTES) {
      return reply.status(400).send({ error: 'VALIDATION', message: `ROOT access can be requested for at most ${JIT_ROOT_MAX_MINUTES} minutes.` });
    }
    // No literal fallback (S2): without DEV_HARDWARE_KEY_ASSERTION, ROOT JIT is unavailable.
    if (rootRequest) {
      const rootCheck = checkRootHardwareAssertion(body.hardwareKeyAssertion);
      if (!rootCheck.ok) return reply.status(rootCheck.status).send({ error: rootCheck.error, message: rootCheck.message });
    }

    const context = await loadConsoleContext(request);
    if (context.rolePermissions.has(permission)) return reply.status(409).send({ error: 'ALREADY_HELD', message: `Your roles already grant ${permission}.` });
    if (context.jit.has(permission)) return reply.status(409).send({ error: 'ALREADY_GRANTED', message: `You already have active access to ${permission}.` });
    const pending = await app.prisma.jitAccessRequest.findFirst({ where: { requesterPlatformUserId: actor(request).id, permission, status: 'PENDING' }, select: { id: true } });
    if (pending) return reply.status(409).send({ error: 'ALREADY_PENDING', message: `You already have a pending request for ${permission}.`, requestId: pending.id });

    const created = await app.prisma.jitAccessRequest.create({
      data: {
        requesterPlatformUserId: actor(request).id,
        requesterStaffId: context.staff.id,
        permission,
        reason: body.reason,
        durationMinutes: body.durationMinutes,
        rootRequest,
        hardwareKeyVerified: rootRequest,
        status: 'PENDING'
      }
    });
    await writeInternalAudit(request, 'jit.request.create', 'jit_request', created.id, null, created, body.reason);
    await recordAndPublishActivity(activityDeps(app), {
      service: 'trust.jit',
      type: 'jit.requested',
      ...staffActor(request),
      subjectType: 'jit_request',
      subjectId: created.id,
      summary: `${actor(request).email} requested ${permission} for ${body.durationMinutes} min`,
      severity: rootRequest ? 'CRITICAL' : 'ATTENTION',
      consoleLink: '/trust/jit/pending'
    });
    await notifyStaff(app, {
      permission: 'trust.jit.approve',
      excludePlatformUserIds: [actor(request).id],
      event: 'jit.requested',
      title: `Access request: ${permission}`,
      body: `${actor(request).email} asks for ${body.durationMinutes} min: ${body.reason}`,
      link: '/trust/jit/pending',
      severity: rootRequest ? 'CRITICAL' : 'ATTENTION'
    });
    const [row] = await present(app, [created], actor(request).id);
    return reply.status(201).send(row);
  });

  app.get('/api/internal/jit/requests/pending', { preHandler: [authenticatePlatformSession, requireConsolePermission('trust.jit.approve')] }, async (request, reply) => {
    const rows = await app.prisma.jitAccessRequest.findMany({ where: { status: 'PENDING' }, include: approvalsInclude, orderBy: { createdAt: 'asc' }, take: 200 });
    return reply.send({ data: await present(app, rows, actor(request).id) });
  });

  app.get('/api/internal/jit/requests', { preHandler: [authenticatePlatformSession, requireConsolePermission('trust.jit.approve')] }, async (request, reply) => {
    const parsed = historyQuery.safeParse(request.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const query = parsed.data;
    const where: Prisma.JitAccessRequestWhereInput = {
      ...(query.state ? stateWhere(query.state, new Date()) : {}),
      ...(query.permission ? { permission: query.permission } : {}),
      ...(query.requesterId ? { requesterPlatformUserId: query.requesterId } : {})
    };
    const rows = await app.prisma.jitAccessRequest.findMany({
      where,
      include: approvalsInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const page = rows.slice(0, query.limit);
    return reply.send({ data: await present(app, page, actor(request).id), nextCursor: rows.length > query.limit ? page[page.length - 1].id : null });
  });

  app.post('/api/internal/jit/requests/:id/approve', { preHandler: dangerous('trust.jit.approve') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const reason = (request.body as { reason: string }).reason.trim();
    const before = await app.prisma.jitAccessRequest.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'NOT_FOUND', message: 'JIT request not found' });
    if (await isRequester(app, request, before)) return reply.status(403).send({ error: 'SELF_APPROVAL', message: 'You cannot approve your own access request.' });
    if (before.status !== 'PENDING') return reply.status(409).send({ error: 'NOT_PENDING', message: `This request is already ${jitState(before).toLowerCase()}.` });
    if (before.rootRequest && !before.hardwareKeyVerified) return reply.status(403).send({ error: 'HARDWARE_KEY_REQUIRED', message: 'ROOT JIT requires hardware key verification' });

    await app.prisma.jitAccessApproval.upsert({
      where: { requestId_approverPlatformUserId: { requestId: id, approverPlatformUserId: actor(request).id } },
      create: { requestId: id, approverPlatformUserId: actor(request).id, decision: 'APPROVED', notes: reason },
      update: { decision: 'APPROVED', notes: reason }
    });
    const approvals = await app.prisma.jitAccessApproval.count({ where: { requestId: id, decision: 'APPROVED' } });
    const required = before.rootRequest ? ROOT_APPROVALS_REQUIRED : 1;
    const granted = approvals >= required;
    if (granted) {
      // Conditional on PENDING so two approvers racing cannot extend the grant twice.
      await app.prisma.jitAccessRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', expiresAt: new Date(Date.now() + before.durationMinutes * 60_000) }
      });
    }
    const after = await app.prisma.jitAccessRequest.findUnique({ where: { id }, include: approvalsInclude });
    if (!after) return reply.status(404).send({ error: 'NOT_FOUND', message: 'JIT request not found' });
    await writeInternalAudit(request, granted ? 'jit.request.approve' : 'jit.request.approval_recorded', 'jit_request', id, before, after, reason);
    await recordAndPublishActivity(activityDeps(app), {
      service: 'trust.jit',
      type: granted ? 'jit.approved' : 'jit.approval_recorded',
      ...staffActor(request),
      subjectType: 'jit_request',
      subjectId: id,
      summary: granted ? `${before.permission} granted for ${before.durationMinutes} min` : `${before.permission}: ${approvals} of ${required} approvals`,
      severity: before.rootRequest ? 'CRITICAL' : 'ATTENTION',
      consoleLink: '/trust/jit/active'
    });
    if (granted) {
      await notifyStaff(app, {
        platformUserIds: [before.requesterPlatformUserId],
        event: 'jit.approved',
        title: `Access granted: ${before.permission}`,
        body: `Active for ${before.durationMinutes} min, until ${after.expiresAt?.toISOString() ?? 'expiry'}.`,
        link: '/trust/jit/request',
        severity: 'INFO'
      });
    }
    const [row] = await present(app, [after], actor(request).id);
    return reply.send({ approvals, required, request: row });
  });

  app.post('/api/internal/jit/requests/:id/deny', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('trust.jit.approve')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = denyBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'REASON_REQUIRED', message: parsed.error.issues.map((issue) => issue.message).join(' ') });
    const reason = parsed.data.reason;
    const before = await app.prisma.jitAccessRequest.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'NOT_FOUND', message: 'JIT request not found' });
    const updated = await app.prisma.jitAccessRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'DENIED', deniedReason: reason } });
    if (updated.count === 0) return reply.status(409).send({ error: 'NOT_PENDING', message: `This request is already ${jitState(before).toLowerCase()}.` });
    const after = await app.prisma.jitAccessRequest.findUnique({ where: { id }, include: approvalsInclude });
    if (!after) return reply.status(404).send({ error: 'NOT_FOUND', message: 'JIT request not found' });
    await writeInternalAudit(request, 'jit.request.deny', 'jit_request', id, before, after, reason);
    await recordAndPublishActivity(activityDeps(app), {
      service: 'trust.jit',
      type: 'jit.denied',
      ...staffActor(request),
      subjectType: 'jit_request',
      subjectId: id,
      summary: `${before.permission} denied: ${reason}`,
      severity: 'INFO',
      consoleLink: '/trust/jit/audit'
    });
    await notifyStaff(app, {
      platformUserIds: [before.requesterPlatformUserId],
      event: 'jit.denied',
      title: `Access request denied: ${before.permission}`,
      body: reason,
      link: '/trust/jit/request',
      severity: 'ATTENTION'
    });
    const [row] = await present(app, [after], actor(request).id);
    return reply.send(row);
  });

  app.get('/api/internal/jit/sessions/active', { preHandler: [authenticatePlatformSession, requireConsolePermission('trust.jit.approve')] }, async (request, reply) => {
    const rows = await app.prisma.jitAccessRequest.findMany({ where: stateWhere('ACTIVE', new Date()), include: approvalsInclude, orderBy: { expiresAt: 'asc' }, take: 200 });
    return reply.send({ data: await present(app, rows, actor(request).id) });
  });

  app.get('/api/internal/jit/sessions/my', { preHandler: [authenticatePlatformSession, requireConsolePermission('trust.jit.request')] }, async (request, reply) => {
    const rows = await app.prisma.jitAccessRequest.findMany({
      where: { requesterPlatformUserId: actor(request).id },
      include: approvalsInclude,
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return reply.send({ data: await present(app, rows, actor(request).id) });
  });

  // W:`trust.jit.approve` (or own): any requester may end their own grant early; ending someone else's needs approve.
  app.post('/api/internal/jit/sessions/:id/revoke', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('trust.jit.request')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await app.prisma.jitAccessRequest.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'NOT_FOUND', message: 'JIT grant not found' });
    const own = before.requesterPlatformUserId === actor(request).id;
    if (!own && !(await consoleUserHas(request, 'trust.jit.approve'))) {
      return reply.status(403).send({ error: 'Forbidden', permission: 'trust.jit.approve', message: 'Ending another person’s grant requires trust.jit.approve.' });
    }
    const rawReason = (request.body as { reason?: unknown } | undefined)?.reason;
    const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (!own && reason.length < 8) return reply.status(400).send({ error: 'REASON_REQUIRED', message: 'A reason of at least 8 characters is required; the requester sees it.' });
    const updated = await app.prisma.jitAccessRequest.updateMany({
      where: { id, status: 'APPROVED', revokedAt: null, expiresAt: { gt: new Date() } },
      data: { status: 'REVOKED', revokedAt: new Date() }
    });
    if (updated.count === 0) return reply.status(409).send({ error: 'NOT_ACTIVE', message: `This grant is ${jitState(before).toLowerCase()}.` });
    const after = await app.prisma.jitAccessRequest.findUnique({ where: { id }, include: approvalsInclude });
    if (!after) return reply.status(404).send({ error: 'NOT_FOUND', message: 'JIT grant not found' });
    await writeInternalAudit(request, 'jit.session.revoke', 'jit_request', id, before, after, reason || 'Ended by the requester');
    await recordAndPublishActivity(activityDeps(app), {
      service: 'trust.jit',
      type: 'jit.revoked',
      ...staffActor(request),
      subjectType: 'jit_request',
      subjectId: id,
      summary: `${before.permission} grant ended${own ? ' by the requester' : `: ${reason}`}`,
      severity: 'INFO',
      consoleLink: '/trust/jit/audit'
    });
    if (!own) {
      await notifyStaff(app, {
        platformUserIds: [before.requesterPlatformUserId],
        event: 'jit.revoked',
        title: `Access ended: ${before.permission}`,
        body: reason,
        link: '/trust/jit/request',
        severity: 'ATTENTION'
      });
    }
    const [row] = await present(app, [after], actor(request).id);
    return reply.send(row);
  });
}
