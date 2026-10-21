import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// customer.success (WP-4.8) against real Postgres: playbook runs execute steps in order with recorded results and are
// safe to re-run; HEALTH_BELOW starts at most once per tenant per 30 days; at-risk and expansion read real scores and
// usage; a manual scoring run is queued and audited.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));
const mail = vi.hoisted(() => ({ sent: [] as Array<{ tenantId: string; template: string }> }));
const queued = vi.hoisted(() => [] as Array<{ name: string; data: unknown }>);

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'cs@fauward.test', name: 'CS Lead', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_cs', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({
  sendEmail: vi.fn(async (_app: unknown, args: { tenantId: string; template: string }) => {
    mail.sent.push({ tenantId: args.tenantId, template: args.template });
  }),
  sendStaffEmail: vi.fn(async () => undefined)
}));
vi.mock('../../../queues/queues.js', () => ({
  scheduledJobsQueue: {
    add: vi.fn(async (name: string, data: unknown, opts: { jobId: string }) => {
      queued.push({ name, data });
      return { id: opts.jobId, name };
    })
  }
}));

const DAY = 86_400_000;

describe.runIf(HAS_TEST_DB)('customer.success (WP-4.8, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['customer.success.read', 'customer.success.write'];
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleSuccessRoutes } = await import('./success.routes.js');
    await registerConsoleSuccessRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    mail.sent = [];
    queued.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function tenantWithAdmin() {
    const tenant = await createTestTenant(prisma);
    await prisma.user.create({ data: { tenantId: tenant.id, email: `admin-${uniqueSuffix()}@tenant.test`, passwordHash: 'x', role: 'TENANT_ADMIN', isActive: true } });
    return tenant;
  }

  async function score(tenantId: string, value: number, daysAgo: number) {
    await prisma.tenantHealthScore.create({ data: { tenantId, score: value, factors: {}, computedAt: new Date(Date.now() - daysAgo * DAY) } });
  }

  it('ACC-CS-4 a run executes steps in order, records each result, waits, and is safe to re-run', async () => {
    const { advanceRun } = await import('../../../services/customer-success.service.js');
    const tenant = await tenantWithAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/internal/success/playbooks',
      payload: {
        name: `Rescue ${uniqueSuffix()}`,
        trigger: 'MANUAL',
        steps: [
          { type: 'EMAIL_TENANT_ADMINS', template: 'platform_announcement', subject: 'Checking in', body: 'How is Fauward working for you?' },
          { type: 'WAIT', days: 2 },
          { type: 'CREATE_PLATFORM_TICKET', subject: 'Health check call', body: 'Can we book 20 minutes this week?' },
          { type: 'NOTIFY_STAFF', permission: 'customer.success.read', text: 'Follow up on the health check' }
        ]
      }
    });
    expect(created.statusCode).toBe(201);
    const playbookId = created.json().id as string;

    const started = await app.inject({ method: 'POST', url: `/api/internal/success/playbooks/${playbookId}/run`, payload: { tenantId: tenant.id } });
    expect(started.statusCode).toBe(201);
    const run = started.json();
    expect(run).toMatchObject({ status: 'WAITING', currentStep: 2, triggerSource: 'MANUAL' });
    expect(run.steps.map((step: { status: string }) => step.status)).toEqual(['DONE', 'WAITING', 'PENDING', 'PENDING']);
    expect(mail.sent).toEqual([{ tenantId: tenant.id, template: 'platform_announcement' }]);

    // Not due yet: nothing happens; once the wait is over the rest runs exactly once, even with concurrent advancers.
    expect(await advanceRun(app, run.id)).toBe(0);
    const later = new Date(Date.now() + 3 * DAY);
    const results = await Promise.all([advanceRun(app, run.id, later), advanceRun(app, run.id, later)]);
    expect(results.reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(await advanceRun(app, run.id, later)).toBe(0);

    const finished = await prisma.cSPlaybookRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe('COMPLETED');
    const steps = finished.steps as Array<{ type: string; status: string; result: Record<string, unknown> }>;
    expect(steps.map((step) => step.status)).toEqual(['DONE', 'DONE', 'DONE', 'DONE']);
    expect(steps[2].result).toMatchObject({ ticketNumber: expect.any(String) });
    expect(await prisma.supportTicket.count({ where: { tenantId: tenant.id, audience: 'PLATFORM', subject: 'Health check call' } })).toBe(1);
    const history = (await app.inject({ method: 'GET', url: `/api/internal/success/playbooks/${playbookId}/runs` })).json();
    expect(history.data[0]).toMatchObject({ id: run.id, status: 'COMPLETED', tenant: { id: tenant.id } });
    expect(await prisma.platformAuditLog.count({ where: { action: 'CS_PLAYBOOK_RUN_STARTED', targetTenantId: tenant.id } })).toBe(1);
  });

  it('ACC-CS-5 HEALTH_BELOW starts at most once per tenant per 30 days, only for tenants below the score', async () => {
    const { runPlaybookExecutor } = await import('../../../services/customer-success.service.js');
    const low = await tenantWithAdmin();
    const fine = await tenantWithAdmin();
    await score(low.id, 31, 0);
    await score(fine.id, 88, 0);
    const created = await app.inject({ method: 'POST', url: '/api/internal/success/playbooks', payload: { name: `Low health ${uniqueSuffix()}`, trigger: 'HEALTH_BELOW', triggerValue: 32, steps: [{ type: 'NOTIFY_STAFF', permission: 'customer.success.read', text: 'Health dropped' }] } });
    const playbookId = created.json().id as string;

    await runPlaybookExecutor(app);
    await runPlaybookExecutor(app);
    await runPlaybookExecutor(app, new Date(Date.now() + 10 * DAY));
    expect(await prisma.cSPlaybookRun.count({ where: { playbookId, tenantId: low.id } })).toBe(1);
    expect(await prisma.cSPlaybookRun.count({ where: { playbookId, tenantId: fine.id } })).toBe(0);
    expect((await prisma.cSPlaybookRun.findFirstOrThrow({ where: { playbookId, tenantId: low.id } })).triggerSource).toBe('HEALTH_BELOW');
    // Deactivate so later runs of this suite on the shared slot do not keep starting it.
    await app.inject({ method: 'PATCH', url: `/api/internal/success/playbooks/${playbookId}`, payload: { active: false } });

    const missingValue = await app.inject({ method: 'POST', url: '/api/internal/success/playbooks', payload: { name: 'No threshold', trigger: 'HEALTH_BELOW', steps: [{ type: 'WAIT', days: 1 }] } });
    expect(missingValue.statusCode).toBe(400);
    // The executor also advances every due run on the shared slot database (earlier suite runs leave some), so this
    // can take longer than the default under the parallel suite.
  }, 60_000);

  it('at-risk lists low scores and two-week declines with the reason; expansion lists usage over 80% of a limit', async () => {
    const { resolveTenantEntitlements } = await import('../../../services/tenant-entitlements.service.js');
    const low = await tenantWithAdmin();
    const sliding = await tenantWithAdmin();
    const healthy = await tenantWithAdmin();
    await score(low.id, 42, 0);
    await score(sliding.id, 85, 15);
    await score(sliding.id, 75, 8);
    await score(sliding.id, 66, 0);
    await score(healthy.id, 92, 0);
    const atRisk = (await app.inject({ method: 'GET', url: '/api/internal/success/at-risk' })).json();
    const byTenant = new Map(atRisk.data.map((row: { tenant: { id: string } }) => [row.tenant.id, row]));
    expect(byTenant.get(low.id)).toMatchObject({ score: 42, reasons: ['score 42 < 45'] });
    expect((byTenant.get(sliding.id) as { reasons: string[] }).reasons[0]).toContain('down two weeks running (85 → 75 → 66)');
    expect(byTenant.has(healthy.id)).toBe(false);

    const busy = await createTestTenant(prisma);
    const limit = (await resolveTenantEntitlements(prisma, busy)).limits.maxShipmentsPm;
    const now = new Date();
    await prisma.usageRecord.create({ data: { tenantId: busy.id, month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`, shipments: Math.ceil(limit * 0.9) } });
    const expansion = (await app.inject({ method: 'GET', url: '/api/internal/success/expansion' })).json();
    const row = expansion.data.find((item: { tenant: { id: string } }) => item.tenant.id === busy.id);
    expect(row.signals[0]).toMatchObject({ limit: 'shipments this month', of: limit });

    const overview = (await app.inject({ method: 'GET', url: '/api/internal/success/overview' })).json();
    expect(overview.distribution.atRisk).toBeGreaterThanOrEqual(1);
    expect(overview.movers.some((mover: { tenant: { id: string } }) => mover.tenant.id === sliding.id)).toBe(true);
 
  }, 90_000);

  it('a manual scoring run is queued with the actor and audited; writes need customer.success.write', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/internal/success/health-scoring/run', payload: {} });
    expect(response.statusCode).toBe(202);
    expect(queued).toEqual([{ name: 'customer.health-scoring', data: { triggeredBy: permissions.userId, reason: 'Manual health scoring run from the CS console' } }]);
    expect(await prisma.platformAuditLog.count({ where: { action: 'CS_HEALTH_SCORING_QUEUED', actorId: permissions.userId } })).toBeGreaterThanOrEqual(1);
    permissions.current = ['customer.success.read'];
    expect((await app.inject({ method: 'POST', url: '/api/internal/success/health-scoring/run', payload: {} })).statusCode).toBe(403);
    permissions.current = ['customer.success.read', 'customer.success.write'];
  });
});
