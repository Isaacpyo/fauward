import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

// L17 (WP-2.16): console search over tenants' own AuditLog — tenant/action/date filters, cursor pages, and a tenant is
// required unless the caller holds trust.audit.export.

let permissions: Permission[] = ['trust.audit.read'];
vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_1', email: 'audit@fauward.com', name: 'Auditor', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions), jit: new Map(), permissions }))
}));
vi.mock('./internal-audit.js', () => ({ writeInternalAudit: vi.fn(async () => undefined) }));

const ROWS = [
  { id: 'a3', tenantId: 'tenant_a', actorId: null, actorType: 'IMPERSONATOR', action: 'RATE_CARD_UPDATED', resourceType: 'rate_card', resourceId: 'rc_1', timestamp: new Date('2026-10-19T10:00:00Z'), metadata: { impersonationSessionId: 'imp_2' }, actor: { email: 'admin@a.test' }, tenant: { id: 'tenant_a', name: 'Northwind', slug: 'northwind' } },
  { id: 'a2', tenantId: 'tenant_a', actorId: 'u_1', actorType: 'USER', action: 'SHIPMENT_CREATED', resourceType: 'shipment', resourceId: 'sh_1', timestamp: new Date('2026-10-18T10:00:00Z'), metadata: null, actor: { email: 'ops@a.test' }, tenant: { id: 'tenant_a', name: 'Northwind', slug: 'northwind' } },
  { id: 'b1', tenantId: 'tenant_b', actorId: 'u_2', actorType: 'USER', action: 'SHIPMENT_CREATED', resourceType: 'shipment', resourceId: 'sh_9', timestamp: new Date('2026-10-17T10:00:00Z'), metadata: null, actor: { email: 'ops@b.test' }, tenant: { id: 'tenant_b', name: 'Other', slug: 'other' } }
];

type Where = { tenantId?: string; action?: { contains: string }; timestamp?: { gte?: Date; lte?: Date } };

async function buildApp() {
  const findMany = vi.fn(async ({ where, take, cursor }: { where: Where; take: number; cursor?: { id: string } }) => {
    let rows = ROWS.filter(
      (row) =>
        (!where.tenantId || row.tenantId === where.tenantId) &&
        (!where.action || row.action.toLowerCase().includes(where.action.contains.toLowerCase())) &&
        (!where.timestamp?.gte || row.timestamp >= where.timestamp.gte) &&
        (!where.timestamp?.lte || row.timestamp <= where.timestamp.lte)
    );
    if (cursor) rows = rows.slice(rows.findIndex((row) => row.id === cursor.id) + 1);
    return rows.slice(0, take);
  });
  const app = Fastify();
  app.decorate('prisma', { auditLog: { findMany } } as never);
  const { registerInternalAuditRoutes } = await import('./audit.routes.js');
  await registerInternalAuditRoutes(app);
  return { app, findMany };
}

afterEach(() => {
  permissions = ['trust.audit.read'];
});

describe('console tenant audit search (WP-2.16)', () => {
  it('ACC-L17-1 filters by tenant, action and date with cursor pages; impersonated rows read as Fauward staff', async () => {
    const { app } = await buildApp();
    const first = await app.inject({ method: 'GET', url: '/api/internal/audit/tenant-events?tenantId=tenant_a&limit=1' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ data: [{ id: 'a3', actorLabel: 'Fauward staff (via impersonation)', tenant: { name: 'Northwind' } }], nextCursor: 'a3' });
    const second = await app.inject({ method: 'GET', url: '/api/internal/audit/tenant-events?tenantId=tenant_a&limit=1&cursor=a3' });
    expect(second.json()).toMatchObject({ data: [{ id: 'a2', actorLabel: 'ops@a.test' }], nextCursor: null });
    const filtered = await app.inject({ method: 'GET', url: '/api/internal/audit/tenant-events?tenantId=tenant_a&action=shipment&from=2026-10-18T00:00:00Z&to=2026-10-18T23:59:59Z' });
    expect((filtered.json() as { data: Array<{ id: string }> }).data.map((row) => row.id)).toEqual(['a2']);
    expect((await app.inject({ method: 'GET', url: '/api/internal/audit/tenant-events?tenantId=tenant_a&from=yesterday' })).statusCode).toBe(400);
    await app.close();
  });

  it('a cross-tenant search needs trust.audit.export', async () => {
    const { app } = await buildApp();
    const refused = await app.inject({ method: 'GET', url: '/api/internal/audit/tenant-events?action=shipment' });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ error: 'TENANT_REQUIRED' });
    permissions = ['trust.audit.read', 'trust.audit.export'];
    const { app: exporter } = await buildApp();
    const all = await exporter.inject({ method: 'GET', url: '/api/internal/audit/tenant-events?action=shipment' });
    expect((all.json() as { data: Array<{ id: string }> }).data.map((row) => row.id)).toEqual(['a2', 'b1']);
    await app.close();
    await exporter.close();
  });
});
