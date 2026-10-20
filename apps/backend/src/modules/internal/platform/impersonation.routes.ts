import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { consoleUserHas, requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { writePlatformAuditLog } from '../../../services/platform-audit.service.js';
import { recordAndPublishActivity, staffActor } from '../../../services/platform-activity.service.js';
import { notifyTenantAdmins } from '../../../services/platform-notifier.service.js';
import {
  WRITE_SCOPE_MIN_REASON,
  createExchangeCode,
  impersonationActiveKey,
  impersonationDurationMinutes,
  impersonationPortalUrl,
  parseImpersonationScopes
} from '../../../services/impersonation.service.js';
import { platformAuditActor, reasonOf } from '../request-meta.js';

// platform.impersonation (moved from /api/v1/platform in WP-1.1; console centre in WP-1.10).

const listQuery = z.object({
  status: z.enum(['active', 'ended']).optional(),
  tenantId: z.string().min(1).optional(),
  staffId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional()
});

function activityDeps(app: FastifyInstance) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

function sessionWhere(query: z.infer<typeof listQuery>, now: Date): Prisma.PlatformImpersonationSessionWhereInput {
  const where: Prisma.PlatformImpersonationSessionWhereInput = {};
  if (query.status === 'active') Object.assign(where, { revokedAt: null, endedAt: null, expiresAt: { gt: now } });
  if (query.status === 'ended') where.OR = [{ revokedAt: { not: null } }, { endedAt: { not: null } }, { expiresAt: { lte: now } }];
  if (query.tenantId) where.targetTenantId = query.tenantId;
  if (query.staffId) where.platformUserId = query.staffId;
  if (query.from || query.to) where.createdAt = { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) };
  return where;
}

export async function registerConsoleImpersonationRoutes(app: FastifyInstance) {
  app.post('/api/internal/impersonation/sessions', { preHandler: dangerous('platform.impersonation.start') }, async (request, reply) => {
    const payload = request.body as { tenantId?: string; reason: string; targetUserId?: string; scopes?: unknown; expiresInMinutes?: unknown };
    const reason = payload.reason.trim();
    if (!payload.tenantId) return reply.status(400).send({ error: 'TENANT_REQUIRED', message: 'tenantId is required' });
    const scopeRequest = parseImpersonationScopes(payload.scopes);
    if (!scopeRequest.ok) return reply.status(400).send({ error: 'INVALID_SCOPE', message: scopeRequest.error });
    // Write access needs its own permission and a longer reason, and is capped at 15 minutes (S6, D8).
    if (scopeRequest.write) {
      if (!(await consoleUserHas(request, 'platform.impersonation.mutate'))) {
        return reply.status(403).send({ error: 'Forbidden', permission: 'platform.impersonation.mutate', message: 'Write impersonation requires platform.impersonation.mutate.' });
      }
      if (reason.length < WRITE_SCOPE_MIN_REASON) {
        return reply.status(400).send({ error: 'REASON_REQUIRED', message: `Write impersonation needs a reason of at least ${WRITE_SCOPE_MIN_REASON} characters.` });
      }
    }

    const tenant = await app.prisma.tenant.findUnique({ where: { id: payload.tenantId } });
    if (!tenant) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });

    const targetUser = payload.targetUserId
      ? await app.prisma.user.findFirst({ where: { id: payload.targetUserId, tenantId: tenant.id, isActive: true } })
      : await app.prisma.user.findFirst({ where: { tenantId: tenant.id, role: 'TENANT_ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!targetUser) return reply.status(404).send({ error: 'TARGET_USER_NOT_FOUND', message: 'No active target tenant user found for impersonation' });

    const minutes = impersonationDurationMinutes(payload.expiresInMinutes, scopeRequest.write);
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
    const session = await app.prisma.platformImpersonationSession.create({
      data: { platformUserId: request.platform!.user.id, targetTenantId: tenant.id, targetUserId: targetUser.id, scopes: scopeRequest.scopes, reason, expiresAt }
    });

    await app.redis.set(impersonationActiveKey(session.id), '1', 'EX', minutes * 60);
    const exchangeCode = await createExchangeCode(app.redis, session.id);
    await writePlatformAuditLog(app.prisma, {
      ...platformAuditActor(request),
      actorType: 'PLATFORM_USER',
      action: 'TENANT_IMPERSONATION_START',
      targetTenantId: tenant.id,
      targetUserId: targetUser.id,
      impersonationSessionId: session.id,
      reason,
      metadata: { scopes: scopeRequest.scopes, expiresAt: expiresAt.toISOString() }
    });
    await recordAndPublishActivity(activityDeps(app), {
      service: 'platform.impersonation',
      type: 'impersonation.started',
      tenantId: tenant.id,
      ...staffActor(request),
      subjectType: 'impersonation_session',
      subjectId: session.id,
      summary: `${tenant.name}: ${scopeRequest.write ? 'write' : 'read-only'} session as ${targetUser.email} for ${minutes} min`,
      severity: scopeRequest.write ? 'CRITICAL' : 'ATTENTION',
      consoleLink: `/platform/impersonation/sessions/${session.id}`
    });
    // D8 / L18: the tenant's admins are told at once, in-app always; the email only stays off when an Enterprise tenant
    // turned it off (TenantSettings.notifyOnStaffAccess).
    const settings = await app.prisma.tenantSettings.findUnique({ where: { tenantId: tenant.id }, select: { notifyOnStaffAccess: true } });
    const emailOff = settings?.notifyOnStaffAccess === false && tenant.plan === 'ENTERPRISE';
    const staffName = request.platform!.user.name ?? 'A Fauward staff member';
    const scope = scopeRequest.write ? 'read and write' : 'read-only';
    await notifyTenantAdmins(app, {
      tenantId: tenant.id,
      event: 'staff_access.started',
      title: `Fauward staff opened your workspace (${scope})`,
      body: `${staffName}: ${reason}`,
      link: '/settings?tab=staff-access',
      ...(emailOff ? {} : { email: { template: 'staff_access_started' as const, data: { staffName, scope, reason } } })
    });
    // The token is only issued to the tenant portal through the one-time exchange code (S18).
    return reply.send({
      exchangeCode,
      portalUrl: impersonationPortalUrl(tenant.slug, exchangeCode),
      impersonationSessionId: session.id,
      expiresAt: expiresAt.toISOString(),
      targetUser: { id: targetUser.id, email: targetUser.email, role: targetUser.role },
      session,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }
    });
  });

  app.get('/api/internal/impersonation/sessions', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.impersonation.start')] }, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const query = parsed.data;
    const rows = await app.prisma.platformImpersonationSession.findMany({
      where: sessionWhere(query, new Date()),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        targetTenant: { select: { id: true, name: true, slug: true } },
        platformUser: { select: { id: true, email: true, name: true } }
      }
    });
    const hasMore = rows.length > query.limit;
    const sessions = hasMore ? rows.slice(0, query.limit) : rows;
    return reply.send({ sessions, nextCursor: hasMore ? sessions[sessions.length - 1]?.id ?? null : null });
  });

  app.get('/api/internal/impersonation/sessions/:id', { preHandler: [authenticatePlatformSession, requireConsolePermission('platform.impersonation.start')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await app.prisma.platformImpersonationSession.findUnique({
      where: { id },
      include: {
        targetTenant: { select: { id: true, name: true, slug: true } },
        platformUser: { select: { id: true, email: true, name: true } }
      }
    });
    if (!session) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Impersonation session not found' });
    // Tenant audit rows written in-session carry the session id (WP-0.5 audit stamping, C25).
    const auditRows = await app.prisma.auditLog.findMany({
      where: { tenantId: session.targetTenantId, metadata: { path: ['impersonationSessionId'], equals: session.id } },
      orderBy: { timestamp: 'asc' },
      take: 500
    });
    return reply.send({ session, auditRows });
  });

  app.delete('/api/internal/impersonation/sessions/:id', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('platform.impersonation.start')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.platformImpersonationSession.findUnique({ where: { id }, include: { targetTenant: { select: { name: true } } } });
    if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Impersonation session not found' });
    if (existing.platformUserId !== request.platform!.user.id && !(await consoleUserHas(request, 'platform.impersonation.mutate'))) {
      return reply.status(403).send({ error: 'Forbidden', permission: 'platform.impersonation.mutate', message: "Ending another staff member's session requires platform.impersonation.mutate." });
    }
    const reason = reasonOf(request) || 'Ended by staff';
    const now = new Date();
    const ended = await app.prisma.platformImpersonationSession.updateMany({
      where: { id, revokedAt: null, endedAt: null },
      data: { revokedAt: now, endedAt: now, endedReason: 'REVOKED' }
    });
    await app.redis.del(impersonationActiveKey(id));
    await writePlatformAuditLog(app.prisma, {
      ...platformAuditActor(request),
      actorType: 'PLATFORM_USER',
      action: 'TENANT_IMPERSONATION_END',
      targetTenantId: existing.targetTenantId,
      impersonationSessionId: id,
      reason,
      metadata: { revoked: ended.count > 0, endedReason: 'REVOKED' }
    });
    if (ended.count > 0) {
      await recordAndPublishActivity(activityDeps(app), {
        service: 'platform.impersonation',
        type: 'impersonation.ended',
        tenantId: existing.targetTenantId,
        ...staffActor(request),
        subjectType: 'impersonation_session',
        subjectId: id,
        summary: `${existing.targetTenant.name}: staff session ended`,
        consoleLink: `/platform/impersonation/sessions/${id}`,
        dedupeKey: `impersonation.ended:${id}`
      });
    }
    return reply.status(204).send();
  });
}
