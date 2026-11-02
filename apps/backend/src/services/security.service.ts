import { isIP } from 'node:net';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { notifyStaff } from './platform-notifier.service.js';
import { config } from '../config/index.js';
import { clientIp } from '../shared/client-ip.js';
import { IP_BLOCK_CACHE_TTL_MS, parseBypassCidrs, publishIpBlocksChanged } from './ip-block-enforcement.service.js';

// trust.security (WP-4.11). Anomalies come from the hourly `trust.security-anomaly-scan` (failed staff login spikes);
// staff acknowledge and resolve them. Staff login attempts are recorded at console sign-in; tenant users' failed
// sign-ins are not recorded anywhere, so the logins view says so instead of showing nothing. IP blocks carry a scope and
// expiry (enforced by the WP-5.4 middleware). Revoking a console session makes that staff member's next request 401.

const SERVICE = 'trust.security';
export const IP_SCOPES = ['ALL', 'CONSOLE', 'TENANT_API'] as const;

export class SecurityError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const cursorPage = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().min(1).optional() });

function page<T extends { id: string }>(rows: T[], limit: number) {
  const data = rows.slice(0, limit);
  return { data, nextCursor: rows.length > limit ? data[data.length - 1]?.id ?? null : null };
}

// ── Anomalies ────────────────────────────────────────────────────────────────

export const anomalyQuery = cursorPage.extend({ status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ALL']).default('OPEN'), type: z.string().trim().max(80).optional(), severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional() });
export const resolveBody = z.object({ note: z.string().trim().min(8).max(2000) });

export async function listAnomalies(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof anomalyQuery>) {
  const where: Prisma.SecurityAnomalyWhereInput = { ...(query.status === 'ALL' ? {} : { status: query.status }), ...(query.type ? { anomalyType: query.type } : {}), ...(query.severity ? { severity: query.severity } : {}) };
  const rows = await app.prisma.securityAnomaly.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
  const result = page(rows, query.limit);
  return {
    data: result.data.map((row) => ({ id: row.id, type: row.anomalyType, severity: row.severity, status: row.status, actorId: row.actorId, tenantId: row.tenantId, details: row.payload, acknowledgedBy: row.acknowledgedBy, acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null, resolvedBy: row.resolvedBy, resolvedAt: row.resolvedAt?.toISOString() ?? null, resolutionNote: row.resolutionNote, createdAt: row.createdAt.toISOString() })),
    nextCursor: result.nextCursor
  };
}

async function moveAnomaly(app: FastifyInstance, request: FastifyRequest, id: string, to: 'ACKNOWLEDGED' | 'RESOLVED', note: string | null) {
  const anomaly = await app.prisma.securityAnomaly.findUnique({ where: { id } });
  if (!anomaly) throw new SecurityError(404, 'ANOMALY_NOT_FOUND', 'Anomaly not found');
  const allowed = to === 'ACKNOWLEDGED' ? ['OPEN'] : ['OPEN', 'ACKNOWLEDGED'];
  if (!allowed.includes(anomaly.status)) throw new SecurityError(409, 'INVALID_STATE', `This anomaly is ${anomaly.status.toLowerCase()}.`);
  const staffId = request.platform!.user.id;
  const now = new Date();
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const claimed = await tx.securityAnomaly.updateMany({
      where: { id, status: { in: allowed } },
      data: to === 'ACKNOWLEDGED' ? { status: to, acknowledgedBy: staffId, acknowledgedAt: now } : { status: to, resolvedBy: staffId, resolvedAt: now, resolutionNote: note, ...(anomaly.acknowledgedAt ? {} : { acknowledgedBy: staffId, acknowledgedAt: now }) }
    });
    if (claimed.count !== 1) throw new SecurityError(409, 'INVALID_STATE', 'The anomaly changed; reload and try again.');
    return {
      result: { id, status: to },
      audit: { action: to === 'ACKNOWLEDGED' ? 'SECURITY_ANOMALY_ACKNOWLEDGED' : 'SECURITY_ANOMALY_RESOLVED', targetTenantId: anomaly.tenantId, reason: note, metadata: { anomalyId: id, type: anomaly.anomalyType } },
      activity: { type: to === 'ACKNOWLEDGED' ? 'security.anomaly_acknowledged' : 'security.anomaly_resolved', tenantId: anomaly.tenantId, subjectType: 'security_anomaly', subjectId: id, summary: `${anomaly.anomalyType.replace(/_/g, ' ')} ${to.toLowerCase()}`, consoleLink: '/trust/security/anomalies' }
    };
  });
}

export const acknowledgeAnomaly = (app: FastifyInstance, request: FastifyRequest, id: string) => moveAnomaly(app, request, id, 'ACKNOWLEDGED', null);
export const resolveAnomaly = (app: FastifyInstance, request: FastifyRequest, id: string, note: string) => moveAnomaly(app, request, id, 'RESOLVED', note);

// ── Logins ───────────────────────────────────────────────────────────────────

export const loginQuery = cursorPage.extend({ outcome: z.enum(['ALL', 'FAILED', 'SUCCEEDED']).default('ALL'), email: z.string().trim().max(200).optional() });

export async function listLogins(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof loginQuery>) {
  const where: Prisma.StaffLoginAttemptWhereInput = { ...(query.outcome === 'ALL' ? {} : { success: query.outcome === 'SUCCEEDED' }), ...(query.email ? { staffEmail: { contains: query.email, mode: 'insensitive' } } : {}) };
  const rows = await app.prisma.staffLoginAttempt.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
  const result = page(rows, query.limit);
  return {
    data: result.data.map((row) => ({ id: row.id, email: row.staffEmail, platformUserId: row.platformUserId, success: row.success, ipAddress: row.ipAddress, country: row.country, userAgent: row.userAgent, failureReason: row.failureReason, createdAt: row.createdAt.toISOString() })),
    nextCursor: result.nextCursor,
    tenantLogins: { available: false, reason: 'Tenant users’ failed sign-ins are not recorded; only staff (console) sign-ins appear here.' }
  };
}

// ── IP blocks ────────────────────────────────────────────────────────────────

export const ipBlockBody = z.object({
  ipAddress: z.string().trim().refine((value) => isIP(value) !== 0, 'A single IPv4 or IPv6 address'),
  scope: z.enum(IP_SCOPES).default('ALL'),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  reason: z.string().trim().min(8)
});
export const ipRemoveBody = z.object({ reason: z.string().trim().min(8) });

export async function listIpBlocks(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof cursorPage>) {
  const now = new Date();
  const rows = await app.prisma.ipBlock.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
  const result = page(rows, query.limit);
  return {
    data: result.data.map((row) => ({ id: row.id, ipAddress: row.ipAddress, scope: row.scope, reason: row.reason, expiresAt: row.expiresAt?.toISOString() ?? null, active: !row.expiresAt || row.expiresAt > now, createdBy: row.createdBy, hitCount: row.hitCount, lastHitAt: row.lastHitAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })),
    nextCursor: result.nextCursor,
    enforcement: { enforced: true, bypassCidrs: parseBypassCidrs(config.security.ipBlockBypassCidrs).count, cacheTtlSeconds: IP_BLOCK_CACHE_TTL_MS / 1000 }
  };
}

export async function createIpBlock(app: FastifyInstance, request: FastifyRequest, body: z.infer<typeof ipBlockBody>) {
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw new SecurityError(400, 'INVALID_EXPIRY', 'The expiry must be in the future');
  const ownIp = clientIp(request);
  if (ownIp && ownIp === body.ipAddress && body.scope !== 'TENANT_API') throw new SecurityError(409, 'OWN_IP', 'That is your own address; blocking it would lock you out of the console.');
  try {
    const created = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
      const row = await tx.ipBlock.create({ data: { ipAddress: body.ipAddress, scope: body.scope, reason: body.reason, expiresAt, createdBy: request.platform!.user.id } });
      return {
        result: { id: row.id, ipAddress: row.ipAddress, scope: row.scope, expiresAt: row.expiresAt?.toISOString() ?? null },
        audit: { action: 'SECURITY_IP_BLOCKED', reason: body.reason, metadata: { ipBlockId: row.id, ipAddress: row.ipAddress, scope: row.scope, expiresAt: row.expiresAt?.toISOString() ?? null } },
        activity: { type: 'security.ip_blocked', subjectType: 'ip_block', subjectId: row.id, summary: `IP ${row.ipAddress} blocked (${row.scope.toLowerCase()})${expiresAt ? ` until ${expiresAt.toISOString().slice(0, 16).replace('T', ' ')}` : ''}`, severity: 'ATTENTION', consoleLink: '/trust/security/ip-blocks' }
      };
    });
    publishIpBlocksChanged(app.redis, app.log);
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new SecurityError(409, 'ALREADY_BLOCKED', 'That address is already blocked; remove the block first to change it.');
    throw error;
  }
}

export async function removeIpBlock(app: FastifyInstance, request: FastifyRequest, id: string, reason: string) {
  const row = await app.prisma.ipBlock.findUnique({ where: { id } });
  if (!row) throw new SecurityError(404, 'IP_BLOCK_NOT_FOUND', 'IP block not found');
  const removed = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    await tx.ipBlock.delete({ where: { id } });
    return {
      result: { id, removed: true },
      audit: { action: 'SECURITY_IP_UNBLOCKED', reason, metadata: { ipBlockId: id, ipAddress: row.ipAddress, scope: row.scope } },
      activity: { type: 'security.ip_unblocked', subjectType: 'ip_block', subjectId: id, summary: `IP ${row.ipAddress} unblocked`, consoleLink: '/trust/security/ip-blocks' }
    };
  });
  publishIpBlocksChanged(app.redis, app.log);
  return removed;
}

// ── Staff sessions ───────────────────────────────────────────────────────────

export const revokeBody = z.object({ reason: z.string().trim().min(8) });

export async function listSessions(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof cursorPage>, currentSessionId: string | null) {
  const now = new Date();
  const rows = await app.prisma.platformSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: now } },
    include: { platformUser: { select: { id: true, email: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
  });
  const result = page(rows, query.limit);
  return {
    data: result.data.map((row) => ({ id: row.id, user: row.platformUser, ipAddress: row.ipAddress, userAgent: row.userAgent, mfaVerified: Boolean(row.mfaVerifiedAt), startedAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), current: row.id === currentSessionId })),
    nextCursor: result.nextCursor
  };
}

export async function revokeSession(app: FastifyInstance, request: FastifyRequest, id: string, reason: string) {
  const session = await app.prisma.platformSession.findUnique({ where: { id }, include: { platformUser: { select: { id: true, email: true, name: true } } } });
  if (!session) throw new SecurityError(404, 'SESSION_NOT_FOUND', 'Session not found');
  if (session.revokedAt) throw new SecurityError(409, 'ALREADY_REVOKED', 'This session is already revoked.');
  if (session.id === request.platform?.session.id) throw new SecurityError(409, 'OWN_SESSION', 'Sign out instead of revoking your own session.');
  const now = new Date();
  const result = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    await tx.platformSession.update({ where: { id }, data: { revokedAt: now } });
    await tx.staffSession.updateMany({ where: { platformSessionId: id, revokedAt: null }, data: { revokedAt: now } });
    return {
      result: { id, revokedAt: now.toISOString() },
      audit: { action: 'SECURITY_SESSION_REVOKED', reason, metadata: { sessionId: id, platformUserId: session.platformUserId, ipAddress: session.ipAddress } },
      activity: { type: 'security.session_revoked', subjectType: 'platform_session', subjectId: id, summary: `Console session of ${session.platformUser.name ?? session.platformUser.email} revoked`, severity: 'ATTENTION', consoleLink: '/trust/security/sessions' }
    };
  });
  await notifyStaff(app, { platformUserIds: [session.platformUserId], event: 'security.session_revoked', title: 'One of your console sessions was ended by security', body: reason, severity: 'ATTENTION' });
  return result;
}

export { cursorPage as securityPageQuery };
