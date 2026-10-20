import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

let currentPermissions: Permission[] = [];
let mfaVerifiedAt: Date | null = new Date();

const suspendTenantMock = vi.hoisted(() => vi.fn());
const liftSuspensionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_1', email: 'ops@fauward.com', name: 'Ops', role: 'PLATFORM_READONLY', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt } };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../middleware/require-console-permission.js', () => {
  type ReplyLike = { status: (code: number) => { send: (body: unknown) => unknown } };
  return {
    requireConsolePermission: (permission: Permission) => async (_request: unknown, reply: ReplyLike) => (currentPermissions.includes(permission) ? undefined : reply.status(403).send({ error: 'Forbidden', permission })),
    requireAnyConsolePermission: () => async () => undefined,
    consoleUserHas: async (_request: unknown, permission: Permission) => currentPermissions.includes(permission)
  };
});
vi.mock('../../../services/tenant-suspension.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/tenant-suspension.service.js')>();
  return { ...actual, suspendTenant: suspendTenantMock, liftSuspension: liftSuspensionMock };
});

const openApps: FastifyInstance[] = [];

async function buildApp() {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', {} as never);
  app.decorate('redis', {} as never);
  const { registerConsoleTenantRoutes } = await import('./tenants.routes.js');
  await registerConsoleTenantRoutes(app);
  return app;
}

beforeEach(() => {
  currentPermissions = ['platform.tenants.read', 'platform.tenants.suspend'];
  mfaVerifiedAt = new Date();
  suspendTenantMock.mockReset();
  liftSuspensionMock.mockReset();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('POST /api/internal/tenants/:id/suspend (D3 caller 1)', () => {
  it('403 without platform.tenants.suspend, 403 MFA_REQUIRED with stale MFA, 400 REASON_REQUIRED without a reason', async () => {
    const app = await buildApp();
    currentPermissions = ['platform.tenants.read'];
    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/t_1/suspend', payload: { category: 'AUP', reason: 'Spam campaigns' } })).json()).toEqual({ error: 'Forbidden', permission: 'platform.tenants.suspend' });
    currentPermissions = ['platform.tenants.suspend'];
    mfaVerifiedAt = new Date(Date.now() - 11 * 60_000);
    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/t_1/suspend', payload: { category: 'AUP', reason: 'Spam campaigns' } })).json()).toMatchObject({ error: 'MFA_REQUIRED' });
    mfaVerifiedAt = new Date();
    const noReason = await app.inject({ method: 'POST', url: '/api/internal/tenants/t_1/suspend', payload: { category: 'AUP' } });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json()).toMatchObject({ error: 'REASON_REQUIRED' });
    expect(suspendTenantMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown category and suspends with category, internal reason and public reason through the service', async () => {
    suspendTenantMock.mockResolvedValue({ record: { id: 'susp_1', status: 'ACTIVE' }, tenant: { id: 't_1', status: 'SUSPENDED', suspendedAt: new Date('2026-10-18T12:00:00Z'), suspensionReason: 'Bulk spam' } });
    const app = await buildApp();
    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/t_1/suspend', payload: { category: 'NOPE', reason: 'Spam campaigns' } })).statusCode).toBe(400);
    const response = await app.inject({ method: 'POST', url: '/api/internal/tenants/t_1/suspend', payload: { category: 'AUP', reason: 'Spam campaigns reported', publicReason: 'Bulk spam' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ suspension: { id: 'susp_1' }, tenant: { status: 'SUSPENDED', suspensionReason: 'Bulk spam' } });
    expect(suspendTenantMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 't_1', source: 'PLATFORM', category: 'AUP', reason: 'Spam campaigns reported', publicReason: 'Bulk spam', actor: expect.objectContaining({ type: 'STAFF', platformUserId: 'pu_1' }) }));
  });

  it('maps service errors to their status (404 unknown tenant)', async () => {
    const { SuspensionError } = await import('../../../services/tenant-suspension.service.js');
    suspendTenantMock.mockRejectedValue(new SuspensionError('TENANT_NOT_FOUND', 404, 'Tenant not found'));
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/internal/tenants/missing/suspend', payload: { category: 'OTHER', reason: 'Owner asked for a pause' } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
  });
});

describe('POST /api/internal/tenants/:id/unsuspend', () => {
  it('ACC-TEN-5 lifts only the chosen suspension; lifting everything needs all: true', async () => {
    liftSuspensionMock.mockResolvedValue({ lifted: [{ id: 'susp_2' }], remaining: [{ id: 'susp_1' }], tenant: { id: 't_1', status: 'SUSPENDED', suspendedAt: null, suspensionReason: 'x' }, becameActive: false });
    const app = await buildApp();
    const missing = await app.inject({ method: 'POST', url: '/api/internal/tenants/t_1/unsuspend', payload: { reason: 'Resolved with the tenant' } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ error: 'SUSPENSION_ID_REQUIRED' });

    const one = await app.inject({ method: 'POST', url: '/api/internal/tenants/t_1/unsuspend', payload: { suspensionId: 'susp_2', reason: 'Resolved with the tenant' } });
    expect(one.statusCode).toBe(200);
    expect(liftSuspensionMock).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ tenantId: 't_1', suspensionId: 'susp_2', via: 'MANUAL' }));
    expect(one.json()).toMatchObject({ tenant: { status: 'SUSPENDED' }, remaining: [{ id: 'susp_1' }] });

    await app.inject({ method: 'POST', url: '/api/internal/tenants/t_1/unsuspend', payload: { all: true, reason: 'Resolved with the tenant' } });
    expect(liftSuspensionMock).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ suspensionId: null }));
  });
});

describe('GET /api/internal/tenants', () => {
  it('ACC-TEN-2 an invalid plan or status filter is a 400 naming the field', async () => {
    const app = await buildApp();
    const lower = await app.inject({ method: 'GET', url: '/api/internal/tenants?plan=pro' });
    expect(lower.statusCode).toBe(400);
    expect(lower.json()).toMatchObject({ error: 'INVALID_QUERY', message: expect.stringContaining('plan') });
    expect((await app.inject({ method: 'GET', url: '/api/internal/tenants?status=GONE' })).statusCode).toBe(400);
  });
});
