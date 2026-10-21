import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// trust.compliance legal holds (WP-5.2) against real Postgres: a tenant hold blocks only that tenant's deletes, erasure
// and close; a hold on every tenant needs an approved JIT ROOT session; a released hold no longer blocks.

const session = vi.hoisted(() => ({ userId: 'unset', permissions: [] as Permission[], jitRoot: null as string | null }));
const queueAdd = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: session.userId, email: 'legal@fauward.test', name: 'Lee Legal', role: 'TRUST_ANALYST', status: 'ACTIVE', mfaEnabled: true },
      session: { id: `ps_hold_${session.userId}`, mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: session.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  consolePermissionContext: vi.fn(async () => {
    const jit = new Map(session.jitRoot ? [['trust.iam.root', { id: session.jitRoot, permission: 'trust.iam.root', expiresAt: new Date(Date.now() + 600_000) }]] : []);
    return { staff: null, roles: [], rolePermissions: new Set(session.permissions), jit, permissions: [...session.permissions, ...jit.keys()] };
  })
}));
vi.mock('../../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, scheduledJobsQueue: { add: queueAdd }, bullmqConnection: {} }));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));

describe.runIf(HAS_TEST_DB)('legal holds (WP-5.2, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  const reason = 'Preservation notice 2026-31 received';

  async function erasureRequest(tenantId: string) {
    return prisma.dSARRequest.create({ data: { tenantId, requesterEmail: `subject-${uniqueSuffix()}@example.test`, requestType: 'ERASURE', status: 'DATA_GATHERED', dueAt: new Date(Date.now() + 20 * 86_400_000) } });
  }

  /** A tenant-API DELETE as the tenant (the same preHandler app.ts installs). */
  const tenantDelete = (tenantId: string) => app.inject({ method: 'DELETE', url: '/test/tenant-resource', headers: { 'x-test-tenant': tenantId } });
  const erase = (dsarId: string) => app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${dsarId}/erase`, payload: { reason } });
  const placeHold = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/internal/compliance/legal-holds', payload });
  const release = (id: string) => app.inject({ method: 'POST', url: `/api/internal/compliance/legal-holds/${id}/release`, payload: { reason: 'Matter closed, hold lifted' } });

  async function closeAttempt(tenantId: string) {
    const { closeTenant } = await import('../../../services/tenant-close.service.js');
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return closeTenant(app, { tenantId, reason, confirmSlug: tenant.slug, actor: { type: 'STAFF', platformUserId: session.userId, email: 'legal@fauward.test', label: 'Lee Legal' } }).then(
      () => 'CLOSED',
      (error: { code?: string }) => error.code ?? 'ERROR'
    );
  }

  beforeAll(async () => {
    prisma = createTestPrisma();
    session.userId = (await createTestPlatformUser(prisma)).id;
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { legalHoldDeleteGuard } = await import('../../../middleware/legal-hold-guard.js');
    app.addHook('onRequest', async (request) => {
      const tenantId = request.headers['x-test-tenant'];
      if (typeof tenantId === 'string') request.tenant = { id: tenantId } as never;
    });
    app.addHook('preHandler', legalHoldDeleteGuard(app));
    app.delete('/test/tenant-resource', async (_request, reply) => reply.status(204).send());
    const { registerConsoleComplianceRoutes } = await import('./compliance.routes.js');
    await registerConsoleComplianceRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    session.permissions = ['trust.compliance.legal-hold.read', 'trust.compliance.legal-hold.write', 'trust.compliance.dsar.read', 'trust.compliance.dsar.write', 'trust.compliance.dsar.deliver'];
    session.jitRoot = null;
    queueAdd.mockClear();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it("ACC-LH-1 a tenant-specific hold blocks that tenant's DELETEs, erasure and close, and no other tenant's", async () => {
    const held = await createTestTenant(prisma);
    const other = await createTestTenant(prisma);
    const created = await placeHold({ tenantId: held.id, reason });
    expect(created.statusCode).toBe(201);
    const holdId = created.json<{ hold: { id: string; appliesToAllTenants: boolean } }>().hold.id;
    try {
      expect((await tenantDelete(held.id)).json()).toEqual({ error: 'LEGAL_HOLD_ACTIVE', tenantId: held.id, holdId });
      expect((await tenantDelete(other.id)).statusCode).toBe(204);

      const heldErasure = await erase((await erasureRequest(held.id)).id);
      expect(heldErasure.statusCode).toBe(409);
      expect(heldErasure.json()).toMatchObject({ error: 'LEGAL_HOLD_ACTIVE', holdId });
      const otherErasure = await erase((await erasureRequest(other.id)).id);
      expect(otherErasure.statusCode).toBeLessThan(300);
      expect(queueAdd).toHaveBeenCalledTimes(1);

      expect(await closeAttempt(held.id)).toBe('LEGAL_HOLD_ACTIVE');
    } finally {
      await release(holdId);
    }
  });

  it('ACC-LH-2 a hold on every tenant requires an approved JIT ROOT session; a tenantless hold without the flag is rejected and never blocks', async () => {
    const tenant = await createTestTenant(prisma);
    expect((await placeHold({ reason })).json()).toMatchObject({ error: 'VALIDATION' });
    const refused = await placeHold({ appliesToAllTenants: true, reason });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ error: 'JIT_ROOT_REQUIRED' });

    // A row that bypassed the API (no tenant, no flag) is invalid and blocks nothing (0081 also forbids it with a CHECK).
    const invalid = await prisma.legalHold.create({ data: { tenantId: null, appliesToAllTenants: false, scope: {}, reason, status: 'ACTIVE', createdBy: 'test' } }).catch(() => null);
    if (invalid) {
      expect((await tenantDelete(tenant.id)).statusCode).toBe(204);
      await prisma.legalHold.delete({ where: { id: invalid.id } });
    }

    session.jitRoot = `jit_root_${uniqueSuffix()}`;
    const placed = await placeHold({ appliesToAllTenants: true, reason });
    expect(placed.statusCode).toBe(201);
    const hold = placed.json<{ hold: { id: string; appliesToAllTenants: boolean; tenant: null } }>().hold;
    try {
      expect(hold).toMatchObject({ appliesToAllTenants: true, tenant: null });
      expect((await tenantDelete(tenant.id)).json()).toMatchObject({ error: 'LEGAL_HOLD_ACTIVE', holdId: hold.id });
      const audit = await prisma.platformAuditLog.findFirst({ where: { targetType: 'legal_hold', targetId: hold.id }, orderBy: { seq: 'desc' } });
      expect(audit).toMatchObject({ action: 'compliance.legal_hold.create', jitSessionId: session.jitRoot });

      // Releasing the global hold needs the JIT ROOT session too.
      session.jitRoot = null;
      expect((await release(hold.id)).json()).toMatchObject({ error: 'JIT_ROOT_REQUIRED' });
    } finally {
      session.jitRoot = `jit_root_${uniqueSuffix()}`;
      expect((await release(hold.id)).statusCode).toBe(200);
    }
  });

  it('ACC-LH-3 releasing a hold records who, when and why, and unblocks deletes and erasure', async () => {
    const tenant = await createTestTenant(prisma);
    const holdId = (await placeHold({ tenantId: tenant.id, reason })).json<{ hold: { id: string } }>().hold.id;
    expect((await tenantDelete(tenant.id)).statusCode).toBe(409);

    const released = await release(holdId);
    expect(released.statusCode).toBe(200);
    expect(released.json<{ hold: Record<string, unknown> }>().hold).toMatchObject({ status: 'RELEASED', releasedBy: session.userId, releaseReason: 'Matter closed, hold lifted' });
    expect((await prisma.legalHold.findUniqueOrThrow({ where: { id: holdId } })).releasedAt).toBeInstanceOf(Date);

    expect((await tenantDelete(tenant.id)).statusCode).toBe(204);
    const erasure = await erase((await erasureRequest(tenant.id)).id);
    expect(erasure.statusCode).toBeLessThan(300);
    expect((await release(holdId)).json()).toMatchObject({ error: 'ALREADY_RELEASED' });
  });
});
