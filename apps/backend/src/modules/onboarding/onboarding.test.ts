import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// L7 onboarding (WP-2.17): steps are stamped only by real events; the tenant cannot mark them; the console funnel and
// stuck list read the stamps; a nudge goes out at most once per 7 days.

const notifyTenantAdmins = vi.hoisted(() => vi.fn(async (_app: unknown, _input: Record<string, unknown>) => ({ inApp: 1, emailsQueued: 1 })));
vi.mock('../../services/platform-notifier.service.js', () => ({ notifyTenantAdmins }));
vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_cs', email: 'cs@fauward.com', name: 'Casey CS', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(['customer.onboarding.read', 'customer.success.write']), jit: new Map(), permissions: [] }))
}));
vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: FastifyRequest) => {
    request.user = { sub: 'u_admin', email: 'admin@a.test', role: 'TENANT_ADMIN', tenantId: 't_new', tenantSlug: 't-new', plan: 'PRO', mfaVerified: true };
    request.tenant = { id: 't_new' } as never;
  }
}));

type TenantRow = { id: string; name: string; slug: string; plan: string; status: string; createdAt: Date; onboardingSteps: Record<string, unknown>; onboardingCompletedAt: Date | null; onboardingNudgedAt: Date | null };

const DAY = 24 * 60 * 60 * 1000;

function createStore() {
  const now = Date.now();
  const tenants: TenantRow[] = [
    { id: 't_new', name: 'New Co', slug: 't-new', plan: 'PRO', status: 'TRIALING', createdAt: new Date(now - 10 * DAY), onboardingSteps: { BRANDING: true, TEAM: true, PAYMENT: true, FIRST_SHIPMENT: true }, onboardingCompletedAt: null, onboardingNudgedAt: null },
    { id: 't_branded', name: 'Branded Co', slug: 'branded', plan: 'STARTER', status: 'ACTIVE', createdAt: new Date(now - 20 * DAY), onboardingSteps: { BRANDING_SET: new Date(now - 19 * DAY).toISOString() }, onboardingCompletedAt: null, onboardingNudgedAt: null },
    { id: 't_done', name: 'Done Co', slug: 'done', plan: 'PRO', status: 'ACTIVE', createdAt: new Date(now - 30 * DAY), onboardingSteps: { BRANDING_SET: 'x', GATEWAY_VERIFIED: new Date(now - 29 * DAY).toISOString(), FIRST_SHIPMENT: new Date(now - 28 * DAY).toISOString(), TEAMMATE_JOINED: new Date(now - 27 * DAY).toISOString() }, onboardingCompletedAt: new Date(now - 27 * DAY), onboardingNudgedAt: null }
  ];
  // 'x' is not a timestamp: it does not count.
  tenants[2].onboardingSteps.BRANDING_SET = new Date(now - 29 * DAY).toISOString();
  const activity: Array<Record<string, unknown>> = [];
  const find = (id: string) => tenants.find((tenant) => tenant.id === id) ?? null;
  type Where = { id?: string; createdAt?: { gte?: Date; lt?: Date; lte?: Date }; status?: { in: string[] }; onboardingCompletedAt?: null; OR?: Array<{ onboardingNudgedAt: null | { lte: Date } }> };
  const matches = (row: TenantRow, where: Where) =>
    (!where.id || row.id === where.id) &&
    (!where.createdAt?.gte || row.createdAt >= where.createdAt.gte) &&
    (!where.createdAt?.lt || row.createdAt < where.createdAt.lt) &&
    (!where.createdAt?.lte || row.createdAt <= where.createdAt.lte) &&
    (!where.status || where.status.in.includes(row.status)) &&
    (where.onboardingCompletedAt !== null || row.onboardingCompletedAt === null) &&
    (!where.OR || where.OR.some((branch) => (branch.onboardingNudgedAt === null ? row.onboardingNudgedAt === null : row.onboardingNudgedAt !== null && row.onboardingNudgedAt <= branch.onboardingNudgedAt.lte)));
  return {
    tenants,
    activity,
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => find(where.id)),
      findMany: vi.fn(async ({ where }: { where: Where }) => tenants.filter((row) => matches(row, where))),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<TenantRow> }) => Object.assign(find(where.id)!, data)),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<TenantRow> }) => {
        const hit = tenants.filter((row) => matches(row, where));
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      })
    },
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Record<string, unknown> }) => {
        if (!activity.some((row) => row.dedupeKey === where.dedupeKey)) activity.push({ ...create, dedupeKey: where.dedupeKey });
        return { id: `act_${activity.length}`, ...create };
      })
    }
  };
}

let store: ReturnType<typeof createStore>;
const openApps: FastifyInstance[] = [];

async function buildApp() {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', store as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerOnboardingRoutes } = await import('./onboarding.routes.js');
  await registerOnboardingRoutes(app);
  return app;
}

beforeEach(() => {
  store = createStore();
  notifyTenantAdmins.mockClear();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('L7 onboarding (WP-2.17)', () => {
  it('ACC-L7-1 ACC-ONB-1 clicking through completes nothing: old click flags do not count and there is no endpoint to mark a step', async () => {
    const app = await buildApp();
    const checklist = await app.inject({ method: 'GET', url: '/api/v1/onboarding/checklist' });
    expect(checklist.statusCode).toBe(200);
    expect(checklist.json()).toMatchObject({ completedAt: null, nextStep: 'BRANDING_SET' });
    expect((checklist.json() as { steps: Array<{ doneAt: string | null }> }).steps.every((step) => step.doneAt === null)).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenants/me/onboarding/steps', payload: { step: 'FIRST_SHIPMENT' } })).statusCode).toBe(404);
  });

  it('ACC-L7-2 ACC-ONB-2 the first real shipment stamps its step once, records activity and moves the funnel', async () => {
    const app = await buildApp();
    const before = (await app.inject({ method: 'GET', url: '/api/internal/onboarding/funnel' })).json() as { steps: Array<{ step: string; count: number }> };
    expect(before.steps.find((step) => step.step === 'FIRST_SHIPMENT')!.count).toBe(1);
    const { markOnboardingStep } = await import('../../services/onboarding.service.js');
    await expect(markOnboardingStep({ prisma: store as never }, 't_new', 'FIRST_SHIPMENT')).resolves.toMatchObject({ stamped: true, completed: false });
    await expect(markOnboardingStep({ prisma: store as never }, 't_new', 'FIRST_SHIPMENT')).resolves.toMatchObject({ stamped: false });
    expect(store.activity).toEqual([expect.objectContaining({ service: 'customer.onboarding', type: 'onboarding.step_completed', tenantId: 't_new', metadata: { step: 'FIRST_SHIPMENT' } })]);
    const after = (await app.inject({ method: 'GET', url: '/api/internal/onboarding/funnel' })).json() as { steps: Array<{ step: string; count: number }> };
    expect(after.steps.find((step) => step.step === 'FIRST_SHIPMENT')!.count).toBe(2);
    const checklist = (await app.inject({ method: 'GET', url: '/api/v1/onboarding/checklist' })).json() as { steps: Array<{ step: string; doneAt: string | null; actionPath: string }> };
    expect(checklist.steps.find((step) => step.step === 'FIRST_SHIPMENT')!.doneAt).not.toBeNull();
    expect(checklist.steps.find((step) => step.step === 'BRANDING_SET')).toMatchObject({ doneAt: null, actionPath: '/settings?tab=branding' });
  });

  it('the step that completes the core set stamps onboardingCompletedAt and records onboarding.completed', async () => {
    const { markOnboardingStep } = await import('../../services/onboarding.service.js');
    for (const step of ['BRANDING_SET', 'GATEWAY_VERIFIED', 'FIRST_SHIPMENT'] as const) await markOnboardingStep({ prisma: store as never }, 't_new', step);
    expect(store.tenants[0].onboardingCompletedAt).toBeNull();
    await expect(markOnboardingStep({ prisma: store as never }, 't_new', 'TEAMMATE_JOINED')).resolves.toMatchObject({ completed: true });
    expect(store.tenants[0].onboardingCompletedAt).toBeInstanceOf(Date);
    expect(store.activity.map((row) => row.type)).toContain('onboarding.completed');
  });

  it('ACC-ONB-3 funnel counts and conversion match the fixture', async () => {
    const app = await buildApp();
    const funnel = (await app.inject({ method: 'GET', url: '/api/internal/onboarding/funnel' })).json() as { accountsCreated: number; completed: number; steps: Array<{ step: string; count: number; conversionFromPrevious: number | null }> };
    expect(funnel.accountsCreated).toBe(3);
    expect(funnel.completed).toBe(1);
    expect(funnel.steps.map((step) => [step.step, step.count])).toEqual([
      ['BRANDING_SET', 2],
      ['GATEWAY_VERIFIED', 1],
      ['FIRST_SHIPMENT', 1],
      ['TEAMMATE_JOINED', 1],
      ['DOMAIN_VERIFIED', 0],
      ['FIRST_PAID_INVOICE', 0]
    ]);
    expect(funnel.steps[0].conversionFromPrevious).toBeCloseTo(2 / 3);
    expect(funnel.steps[1].conversionFromPrevious).toBe(0.5);
    expect((await app.inject({ method: 'GET', url: '/api/internal/onboarding/funnel?cohort=2026-13' })).statusCode).toBe(400);
  });

  it('ACC-ONB-4 stuck tenants and a nudge at most once per 7 days', async () => {
    const app = await buildApp();
    const stuck = (await app.inject({ method: 'GET', url: '/api/internal/onboarding/tenants?stuckAt=GATEWAY_VERIFIED&stuckDays=7' })).json() as { data: Array<{ id: string; nextStep: string; canNudge: boolean }> };
    expect(stuck.data.map((row) => [row.id, row.nextStep, row.canNudge]).sort()).toEqual([
      ['t_branded', 'GATEWAY_VERIFIED', true],
      ['t_new', 'BRANDING_SET', true]
    ]);
    const nudged = await app.inject({ method: 'POST', url: '/api/internal/onboarding/tenants/t_branded/nudge' });
    expect(nudged.statusCode).toBe(200);
    expect(nudged.json()).toMatchObject({ step: 'GATEWAY_VERIFIED' });
    expect(notifyTenantAdmins).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 't_branded', event: 'onboarding.nudged', email: expect.objectContaining({ template: 'onboarding_nudge' }) }));
    expect(store.activity).toEqual([expect.objectContaining({ type: 'onboarding.nudged', tenantId: 't_branded', actorType: 'STAFF' })]);
    const again = await app.inject({ method: 'POST', url: '/api/internal/onboarding/tenants/t_branded/nudge' });
    expect(again.statusCode).toBe(429);
    expect(notifyTenantAdmins).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: 'POST', url: '/api/internal/onboarding/tenants/t_done/nudge' })).statusCode).toBe(409);
  });
});
