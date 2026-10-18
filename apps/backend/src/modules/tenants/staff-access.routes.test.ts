import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

let role = 'TENANT_ADMIN';
vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown }) => {
    request.user = { sub: 'u_admin', tenantId: 'tenant_1', role };
  }
}));

const openApps: FastifyInstance[] = [];
afterEach(async () => {
  role = 'TENANT_ADMIN';
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

const now = Date.now();
const sessions = [
  { id: 'imp_2', targetTenantId: 'tenant_1', reason: 'Fixing a broken rate card on behalf of tenant', scopes: ['read', 'write'], createdAt: new Date(now - 60_000), expiresAt: new Date(now + 840_000), exchangedAt: new Date(now - 50_000), endedAt: null, revokedAt: null, endedReason: null, platformUser: { name: 'Sam Support', email: 'sam@fauward.com' } },
  { id: 'imp_1', targetTenantId: 'tenant_1', reason: 'Investigating a failed label print', scopes: ['read'], createdAt: new Date(now - 7_200_000), expiresAt: new Date(now - 5_400_000), exchangedAt: null, endedAt: new Date(now - 6_000_000), revokedAt: new Date(now - 6_000_000), endedReason: 'REVOKED', platformUser: { name: null, email: 'ops@fauward.com' } }
];

async function buildApp() {
  const prisma = {
    platformImpersonationSession: { findMany: vi.fn(async ({ where }: { where: { targetTenantId: string; endedAt?: null } }) => sessions.filter((row) => row.targetTenantId === where.targetTenantId && (where.endedAt === undefined || row.endedAt === null))) },
    auditLog: { count: vi.fn(async ({ where }: { where: { metadata: { equals: string } } }) => (where.metadata.equals === 'imp_2' ? 3 : 0)) }
  };
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', prisma as never);
  const { registerStaffAccessRoutes } = await import('./staff-access.routes.js');
  await registerStaffAccessRoutes(app);
  return { app, prisma };
}

describe('tenant staff-access log (D8)', () => {
  it('ACC-IMP-10 a tenant admin sees each staff session with reason, scopes, times and audit-row count, scoped to their tenant', async () => {
    const { app, prisma } = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/staff-access' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: Array<Record<string, unknown>> };
    expect(body.data[0]).toMatchObject({ id: 'imp_2', staffName: 'Sam Support', reason: 'Fixing a broken rate card on behalf of tenant', scopes: ['read', 'write'], active: true, auditRows: 3, endedAt: null });
    expect(body.data[1]).toMatchObject({ id: 'imp_1', staffName: 'Fauward staff', scopes: ['read'], active: false, endedReason: 'REVOKED' });
    expect(prisma.platformImpersonationSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { targetTenantId: 'tenant_1' } }));

    const active = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/staff-access/active' });
    expect((active.json() as { data: Array<{ id: string }> }).data.map((row) => row.id)).toEqual(['imp_2']);
  });

  it('only tenant admins can read it', async () => {
    role = 'TENANT_STAFF';
    const { app } = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/api/v1/tenants/me/staff-access' })).statusCode).toBe(403);
  });
});
