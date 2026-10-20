import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

// platform.tenants route effects for the mutations not covered elsewhere (architecture §12.3): limits, internal notes and
// plan-override revoke each change the row, write one audit row and one activity row, and invalidate entitlements.

let currentPermissions: Permission[] = [];

const auditMock = vi.hoisted(() => vi.fn(async (_db: unknown, _input: { action: string; targetTenantId?: string | null; reason?: string | null; metadata?: unknown }) => ({ id: 'aud_1' })));
const activityMock = vi.hoisted(() => vi.fn(async (_deps: unknown, _input: { service: string; type: string; tenantId?: string | null; subjectId: string }) => ({ id: 'act_1' })));
const invalidateMock = vi.hoisted(() => vi.fn(async (_redis: unknown, _tenantId: string) => undefined));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_1', email: 'ops@fauward.com', name: 'Ops', role: 'PLATFORM_OPERATIONS', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../middleware/require-console-permission.js', () => {
  type ReplyLike = { status: (code: number) => { send: (body: unknown) => unknown } };
  return {
    requireConsolePermission: (permission: Permission) => async (_request: unknown, reply: ReplyLike) => (currentPermissions.includes(permission) ? undefined : reply.status(403).send({ error: 'Forbidden', permission })),
    requireAnyConsolePermission: (permissions: Permission[]) => async (_request: unknown, reply: ReplyLike) =>
      permissions.some((permission) => currentPermissions.includes(permission)) ? undefined : reply.status(403).send({ error: 'Forbidden', permission: permissions[0] }),
    consoleUserHas: async (_request: unknown, permission: Permission) => currentPermissions.includes(permission)
  };
});
vi.mock('../../../services/platform-audit.service.js', () => ({ writePlatformAuditLog: auditMock }));
vi.mock('../../../services/platform-activity.service.js', () => ({
  recordAndPublishActivity: activityMock,
  staffActor: () => ({ actorType: 'STAFF', actorId: 'pu_1', actorLabel: 'Ops' })
}));
vi.mock('../../../services/tenant-entitlements.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/tenant-entitlements.service.js')>()),
  invalidateTenantEntitlements: invalidateMock
}));

type TenantRow = { id: string; name: string; maxStaff: number; maxShipmentsPm: number; maxOrganisations: number; limitsOverriddenAt: Date | null; internalNotes: string | null };
type OverrideRow = { id: string; tenantId: string; plan: string; revokedAt: Date | null; tenant: { name: string } };

function createPrisma() {
  const tenants = new Map<string, TenantRow>([['t_acme', { id: 't_acme', name: 'Acme Freight', maxStaff: 3, maxShipmentsPm: 300, maxOrganisations: 10, limitsOverriddenAt: null, internalNotes: null }]]);
  const overrides = new Map<string, OverrideRow>([['po_1', { id: 'po_1', tenantId: 't_acme', plan: 'PRO', revokedAt: null, tenant: { name: 'Acme Freight' } }]]);
  return {
    tenants,
    overrides,
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (tenants.has(where.id) ? { ...tenants.get(where.id)! } : null)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<TenantRow> }) => {
        const next = { ...tenants.get(where.id)!, ...data };
        tenants.set(where.id, next);
        return { ...next };
      })
    },
    tenantPlanOverride: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const row = overrides.get(where.id);
        return row && row.tenantId === where.tenantId ? { ...row } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<OverrideRow> }) => {
        const next = { ...overrides.get(where.id)!, ...data };
        overrides.set(where.id, next);
        return { ...next };
      })
    }
  };
}

const openApps: FastifyInstance[] = [];
let prisma: ReturnType<typeof createPrisma>;
const redis = { publish: vi.fn(async () => 1) };

async function buildApp() {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', prisma as never);
  app.decorate('redis', redis as never);
  const { registerConsoleTenantRoutes } = await import('./tenants.routes.js');
  await registerConsoleTenantRoutes(app);
  return app;
}

beforeEach(() => {
  currentPermissions = ['platform.tenants.read', 'platform.tenants.write', 'revenue.subscriptions.override'];
  prisma = createPrisma();
  auditMock.mockClear();
  activityMock.mockClear();
  invalidateMock.mockClear();
  redis.publish.mockClear();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('platform.tenants mutation effects', () => {
  it('ACC-TEN-8 PATCH /limits sets the override columns, then resetToPlan clears the override; each call audits, records activity and invalidates entitlements', async () => {
    const app = await buildApp();
    const set = await app.inject({ method: 'PATCH', url: '/api/internal/tenants/t_acme/limits', payload: { maxStaff: 25, maxShipmentsPm: -1, reason: 'Enterprise pilot agreed with sales' } });
    expect(set.statusCode).toBe(200);
    expect(prisma.tenants.get('t_acme')).toMatchObject({ maxStaff: 25, maxShipmentsPm: -1, maxOrganisations: 10 });
    expect(prisma.tenants.get('t_acme')!.limitsOverriddenAt).toBeInstanceOf(Date);
    expect(auditMock).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ action: 'TENANT_LIMITS_UPDATED', targetTenantId: 't_acme', reason: 'Enterprise pilot agreed with sales', metadata: expect.objectContaining({ before: expect.objectContaining({ maxStaff: 3 }), after: expect.objectContaining({ maxStaff: 25 }) }) }));
    expect(activityMock).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ service: 'platform.tenants', type: 'tenant.limits_updated', tenantId: 't_acme' }));
    expect(invalidateMock).toHaveBeenCalledWith(redis, 't_acme');

    const reset = await app.inject({ method: 'PATCH', url: '/api/internal/tenants/t_acme/limits', payload: { resetToPlan: true, reason: 'Pilot ended, back to plan' } });
    expect(reset.statusCode).toBe(200);
    expect(prisma.tenants.get('t_acme')!.limitsOverriddenAt).toBeNull();
    expect(auditMock).toHaveBeenCalledTimes(2);
    expect(activityMock).toHaveBeenCalledTimes(2);

    expect((await app.inject({ method: 'PATCH', url: '/api/internal/tenants/t_acme/limits', payload: { maxStaff: 5, reason: 'short' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/internal/tenants/t_missing/limits', payload: { maxStaff: 5, reason: 'Enterprise pilot agreed' } })).statusCode).toBe(404);
    currentPermissions = ['platform.tenants.read'];
    expect((await app.inject({ method: 'PATCH', url: '/api/internal/tenants/t_acme/limits', payload: { maxStaff: 5, reason: 'Enterprise pilot agreed' } })).statusCode).toBe(403);
    expect(auditMock).toHaveBeenCalledTimes(2);
  });

  it('PATCH /internal-notes stores the notes, audits lengths only (no note text) and records a staff.note activity', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'PATCH', url: '/api/internal/tenants/t_acme/internal-notes', payload: { internalNotes: 'Renewal call booked for November' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ internalNotes: 'Renewal call booked for November' });
    expect(prisma.tenants.get('t_acme')!.internalNotes).toBe('Renewal call booked for November');
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'TENANT_INTERNAL_NOTES_UPDATED', metadata: { previousLength: 0, newLength: 32 } }));
    expect(JSON.stringify(auditMock.mock.calls[0][1])).not.toContain('Renewal');
    expect(activityMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'staff.note', tenantId: 't_acme' }));

    currentPermissions = ['customer.success.write'];
    expect((await app.inject({ method: 'PATCH', url: '/api/internal/tenants/t_acme/internal-notes', payload: { internalNotes: 'CS can edit too' } })).statusCode).toBe(200);
    currentPermissions = ['platform.tenants.read'];
    expect((await app.inject({ method: 'PATCH', url: '/api/internal/tenants/t_acme/internal-notes', payload: { internalNotes: 'nope' } })).statusCode).toBe(403);
  });

  it('ACC-ENT-2 DELETE /plan-overrides/:id revokes the override, audits, records activity, invalidates entitlements and publishes plan-changed; a second revoke is 409', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'DELETE', url: '/api/internal/tenants/t_acme/plan-overrides/po_1', payload: { reason: 'Trial of PRO features ended' } });
    expect(response.statusCode).toBe(200);
    expect(prisma.overrides.get('po_1')!.revokedAt).toBeInstanceOf(Date);
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'TENANT_PLAN_OVERRIDE_REVOKED', targetTenantId: 't_acme', reason: 'Trial of PRO features ended', metadata: { overrideId: 'po_1', plan: 'PRO' } }));
    expect(activityMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'tenant.plan_override_revoked', subjectId: 'po_1' }));
    expect(invalidateMock).toHaveBeenCalledWith(redis, 't_acme');
    expect(redis.publish).toHaveBeenCalledWith('tenant:t_acme:plan-changed', expect.stringContaining('"revoked":true'));

    expect((await app.inject({ method: 'DELETE', url: '/api/internal/tenants/t_acme/plan-overrides/po_1', payload: { reason: 'Trial of PRO features ended' } })).json()).toMatchObject({ error: 'ALREADY_REVOKED' });
    // Tenant-scoped lookup: another tenant's id never matches the override.
    expect((await app.inject({ method: 'DELETE', url: '/api/internal/tenants/t_other/plan-overrides/po_1', payload: { reason: 'Trial of PRO features ended' } })).statusCode).toBe(404);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });
});
