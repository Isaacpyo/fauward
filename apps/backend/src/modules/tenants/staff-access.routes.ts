import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { z } from 'zod';

// D8 tenant visibility: tenant admins see every Fauward staff session on their workspace — who, why, which scope, when
// it started and ended, and how many audit rows it wrote. Everything is scoped to the caller's tenant.

type SessionWithStaff = {
  id: string;
  reason: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date;
  exchangedAt: Date | null;
  endedAt: Date | null;
  revokedAt: Date | null;
  endedReason: string | null;
  platformUser: { name: string | null; email: string };
};

function present(session: SessionWithStaff, auditRows: number, now: Date) {
  const endedAt = session.endedAt ?? session.revokedAt;
  return {
    id: session.id,
    staffName: session.platformUser.name ?? 'Fauward staff',
    staffEmail: session.platformUser.email,
    reason: session.reason,
    scopes: session.scopes,
    startedAt: session.createdAt.toISOString(),
    openedAt: session.exchangedAt?.toISOString() ?? null,
    expiresAt: session.expiresAt.toISOString(),
    endedAt: endedAt?.toISOString() ?? null,
    endedReason: session.endedReason ?? (session.expiresAt <= now && !endedAt ? 'EXPIRED' : null),
    active: !endedAt && session.expiresAt > now,
    auditRows
  };
}

function tenantIdOf(request: FastifyRequest) {
  return request.tenant?.id ?? request.user?.tenantId ?? null;
}

export async function registerStaffAccessRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenants/me/staff-access', { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] }, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const query = request.query as { cursor?: string; limit?: string };
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
    const rows = await app.prisma.platformImpersonationSession.findMany({
      where: { targetTenantId: tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { platformUser: { select: { name: true, email: true } } }
    });
    const page = rows.slice(0, limit);
    const counts = await Promise.all(
      page.map((session) => app.prisma.auditLog.count({ where: { tenantId, metadata: { path: ['impersonationSessionId'], equals: session.id } } }))
    );
    const now = new Date();
    return reply.send({ data: page.map((session, index) => present(session, counts[index], now)), nextCursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null });
  });

  app.get('/api/v1/tenants/me/staff-access/active', { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] }, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const now = new Date();
    const sessions = await app.prisma.platformImpersonationSession.findMany({
      where: { targetTenantId: tenantId, revokedAt: null, endedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: { platformUser: { select: { name: true, email: true } } }
    });
    return reply.send({ data: sessions.map((session) => present(session, 0, now)) });
  });

  // D8: whether staff-access emails are sent (in-app notices always are). Only Enterprise workspaces may turn them off.
  app.get('/api/v1/tenants/me/staff-access/settings', { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] }, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const [tenant, settings] = await Promise.all([
      app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } }),
      app.prisma.tenantSettings.findUnique({ where: { tenantId }, select: { notifyOnStaffAccess: true } })
    ]);
    return reply.send({ notifyOnStaffAccess: settings?.notifyOnStaffAccess ?? true, canDisableEmail: tenant?.plan === 'ENTERPRISE' });
  });

  app.patch('/api/v1/tenants/me/staff-access/settings', { preHandler: [authenticate, requireRole(['TENANT_ADMIN'])] }, async (request, reply) => {
    const tenantId = tenantIdOf(request);
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const parsed = z.object({ notifyOnStaffAccess: z.boolean() }).safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: 'notifyOnStaffAccess must be true or false' });
    const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    if (!parsed.data.notifyOnStaffAccess && tenant?.plan !== 'ENTERPRISE') {
      return reply.status(403).send({ error: 'PLAN_REQUIRED', message: 'Only Enterprise workspaces can turn off staff-access emails. In-app notices are always shown.' });
    }
    await app.prisma.tenantSettings.upsert({ where: { tenantId }, update: { notifyOnStaffAccess: parsed.data.notifyOnStaffAccess }, create: { tenantId, notifyOnStaffAccess: parsed.data.notifyOnStaffAccess } });
    return reply.send({ notifyOnStaffAccess: parsed.data.notifyOnStaffAccess, canDisableEmail: tenant?.plan === 'ENTERPRISE' });
  });
}
