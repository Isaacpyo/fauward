import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// customer.feedback (WP-2.8, L12): tenant feedback and feature requests → console triage → status back to the
// requester; NPS answers → summary + health component; the 90-day prompt cadence.

type Row = Record<string, unknown> & { id: string };
const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>) => ({ id: 'job' })));
const tenantUser = vi.hoisted(() => ({ role: 'TENANT_ADMIN', sub: 'u_admin' }));

vi.mock('../../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, bullmqConnection: {} }));
vi.mock('../internal-audit.js', () => ({ writeInternalAudit: vi.fn(async () => undefined) }));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(['customer.feedback.read', 'customer.feedback.write']), jit: new Map(), permissions: [] }))
}));
vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_cs', email: 'cara@fauward.com', name: 'Cara Success', role: 'PLATFORM_SUPPORT', status: 'ACTIVE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: tenantUser.sub, role: tenantUser.role, tenantId: 'tenant_a', email: `${tenantUser.sub}@northwind.test` };
    request.tenant = { id: 'tenant_a', name: 'Northwind', slug: 'northwind' };
  }
}));

function compare(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null || value === undefined;
  if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
    const ops = condition as Record<string, unknown>;
    if ('in' in ops) return (ops.in as unknown[]).includes(value);
    if ('not' in ops) return ops.not === null ? value !== null && value !== undefined : value !== ops.not;
    if ('gte' in ops) return value instanceof Date && value >= (ops.gte as Date);
    if ('lte' in ops) return value instanceof Date && value <= (ops.lte as Date);
    return true;
  }
  return value === condition;
}
const matches = (row: Row, where: Record<string, unknown> = {}) => Object.entries(where).every(([key, condition]) => compare(row[key], condition));

function table(rows: Row[], prefix: string, defaults: Record<string, unknown> = {}) {
  let seq = 0;
  return {
    create: vi.fn(async ({ data }: { data: Row }) => {
      seq += 1;
      const row = { createdAt: new Date(Date.now() + seq), updatedAt: new Date(), ...defaults, ...data, id: data.id ?? `${prefix}_${seq}` };
      rows.push(row);
      return { ...row };
    }),
    findUnique: vi.fn(async ({ where, include }: { where: Row; include?: { comments?: unknown } }) => {
      const row = rows.find((item) => matches(item, where));
      return row ? { ...row, ...(include?.comments ? { comments: [] } : {}) } : null;
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find((item) => matches(item, where)) ?? null),
    findFirstOrThrow: vi.fn(async ({ where }: { where: Record<string, unknown> }) => ({ ...rows.find((item) => matches(item, where))! })),
    findMany: vi.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> } = {}) => rows.filter((item) => matches(item, where ?? {})).map((row) => (select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row }))),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
      const hits = rows.filter((item) => matches(item, where));
      hits.forEach((row) => Object.assign(row, data, { updatedAt: new Date() }));
      return { count: hits.length };
    }),
    upsert: vi.fn(async ({ where, update, create }: { where: Row; update: Row; create: Row }) => {
      const existing = rows.find((item) => matches(item, where));
      if (existing) return Object.assign(existing, update);
      const row = { ...create, id: String(create.userId ?? create.id) };
      rows.push(row);
      return row;
    })
  };
}

function createStore() {
  const data = {
    items: [] as Row[],
    comments: [] as Row[],
    prompts: [] as Row[],
    activity: [] as Row[],
    inApp: [] as Row[],
    staffNotifications: [] as Row[],
    users: [
      { id: 'u_admin', tenantId: 'tenant_a', email: 'u_admin@northwind.test', firstName: 'Ada', lastName: 'Admin', isActive: true, role: 'TENANT_ADMIN', createdAt: new Date('2026-01-01'), lastLogin: new Date() },
      { id: 'u_staff', tenantId: 'tenant_a', email: 'u_staff@northwind.test', firstName: 'Sam', lastName: null, isActive: true, role: 'TENANT_STAFF', createdAt: new Date('2026-01-01'), lastLogin: new Date() }
    ] as Row[]
  };
  const feedbackItem = table(data.items, 'fb', { status: 'NEW', assignedPlatformUserId: null, score: null, title: null, body: null, featureKey: null });
  // Tenant list joins visible comments (the only include the routes use on findMany).
  const baseFindMany = feedbackItem.findMany;
  feedbackItem.findMany = vi.fn(async (args: { where?: Record<string, unknown>; select?: Record<string, boolean>; include?: unknown } = {}) =>
    (await baseFindMany(args)).map((row) => ('include' in args && args.include ? { ...row, comments: data.comments.filter((comment) => comment.feedbackId === row.id && comment.visibleToTenant) } : row))
  );
  const prisma: Record<string, unknown> = {
    feedbackItem,
    feedbackComment: table(data.comments, 'fc'),
    npsPromptState: table(data.prompts, 'nps'),
    tenant: { findMany: vi.fn(async () => [{ id: 'tenant_a', name: 'Northwind', slug: 'northwind' }]) },
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => data.users.filter((user) => matches(user, where))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => data.users.find((user) => matches(user, where)) ?? null)
    },
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Row }) => {
        const existing = data.activity.find((row) => row.dedupeKey === where.dedupeKey);
        if (existing) return existing;
        const row = { ...create, id: `act_${data.activity.length + 1}` };
        data.activity.push(row);
        return row;
      })
    },
    inAppNotification: { createMany: vi.fn(async ({ data: rows }: { data: Row[] }) => data.inApp.push(...rows)) },
    staffUser: { findMany: vi.fn(async () => [{ platformUserId: 'pu_cs' }]) },
    staffNotification: { createMany: vi.fn(async ({ data: rows }: { data: Row[] }) => data.staffNotifications.push(...rows)) },
    platformUser: { findMany: vi.fn(async () => []) }
  };
  prisma.$transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma));
  return { prisma, ...data };
}

let db: ReturnType<typeof createStore>;
let app: FastifyInstance;

beforeEach(async () => {
  queueAdd.mockClear();
  tenantUser.role = 'TENANT_ADMIN';
  tenantUser.sub = 'u_admin';
  db = createStore();
  app = Fastify();
  app.decorate('prisma', db.prisma as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerFeedbackRoutes } = await import('../../feedback/feedback.routes.js');
  const { registerConsoleFeedbackRoutes } = await import('./feedback.routes.js');
  await registerFeedbackRoutes(app);
  await registerConsoleFeedbackRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('customer.feedback (WP-2.8)', () => {
  it('ACC-FB-1 ACC-L12-2 a PlanGate request is a FEATURE_REQUEST with featureKey; PLANNED reaches the tenant', async () => {
    tenantUser.sub = 'u_staff';
    tenantUser.role = 'TENANT_STAFF';
    const created = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/feedback', payload: { type: 'FEATURE_REQUEST', source: 'PLAN_GATE', featureKey: 'apiAccess', title: 'API access on Starter', body: 'We only need read access for one integration.' } });
    expect(created.statusCode).toBe(201);
    expect(db.staffNotifications).toEqual([expect.objectContaining({ platformUserId: 'pu_cs', event: 'feedback.feature_requested' })]);

    const board = await app.inject({ method: 'GET', url: '/api/internal/feedback?type=FEATURE_REQUEST' });
    expect(board.json().data).toEqual([expect.objectContaining({ featureKey: 'apiAccess', source: 'PLAN_GATE', status: 'NEW', tenant: expect.objectContaining({ name: 'Northwind' }), requester: expect.objectContaining({ email: 'u_staff@northwind.test' }) })]);
    const id = board.json().data[0].id as string;

    const planned = await app.inject({ method: 'PATCH', url: `/api/internal/feedback/${id}`, payload: { status: 'PLANNED', message: 'Scheduled for the November release.' } });
    expect(planned.statusCode).toBe(200);
    await app.inject({ method: 'POST', url: `/api/internal/feedback/${id}/comments`, payload: { body: 'Internal: check pricing impact first', visibleToTenant: false } });
    const mine = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/feedback' });
    expect(mine.json().items).toEqual([expect.objectContaining({ id, status: 'PLANNED', comments: [expect.objectContaining({ body: 'Scheduled for the November release.' })] })]);
  });

  it('ACC-FB-2 a status change notifies the requester in-app and by email', async () => {
    tenantUser.sub = 'u_staff';
    tenantUser.role = 'TENANT_STAFF';
    const created = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/feedback', payload: { type: 'BUG', title: 'Label PDF cuts off the barcode', body: 'Happens on A6 labels.' } });
    const id = created.json().item.id as string;
    await app.inject({ method: 'PATCH', url: `/api/internal/feedback/${id}`, payload: { status: 'UNDER_REVIEW' } });
    expect(db.inApp).toEqual([expect.objectContaining({ userId: 'u_staff', type: 'feedback.status_changed', title: 'Your feedback is under review' })]);
    expect(queueAdd.mock.calls.map(([, job]) => job.template)).toContain('feedback_status_changed');
    expect(db.activity.map((row) => row.type)).toEqual(['feedback.created', 'feedback.status_changed']);
    db.inApp.length = 0;
    await app.inject({ method: 'PATCH', url: `/api/internal/feedback/${id}`, payload: { assignedPlatformUserId: 'pu_cs' } });
    expect(db.inApp).toHaveLength(0);
  });

  it('ACC-FB-3 NPS answers appear in the console summary and in the health score component', async () => {
    for (const [user, score] of [['u_admin', 10], ['u_staff', 3]] as const) {
      tenantUser.sub = user;
      expect((await app.inject({ method: 'POST', url: '/api/v1/tenants/me/feedback', payload: { type: 'NPS', score, body: score > 8 ? 'Great tracking page' : 'Too many clicks' } })).statusCode).toBe(201);
    }
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenants/me/feedback', payload: { type: 'NPS' } })).statusCode).toBe(400);
    const summary = await app.inject({ method: 'GET', url: '/api/internal/feedback?type=NPS' });
    expect(summary.json().nps.overall).toEqual({ responses: 2, promoters: 1, passives: 0, detractors: 1, nps: 0 });
    expect(summary.json().nps.byMonth).toEqual([expect.objectContaining({ month: new Date().toISOString().slice(0, 7), responses: 2, nps: 0 })]);
    // WP-3.3: the tenant's NPS feeds the health score's NPS factor (0 → half of it).
    const { npsFraction } = await import('../../../services/health-score.service.js');
    expect(npsFraction(summary.json().nps.overall.nps)).toBe(0.5);
    expect(db.activity.find((row) => (row.metadata as { type?: string }).type === 'NPS' && row.severity === 'ATTENTION')).toBeTruthy();
  });

  it('ACC-FB-4 the prompt is offered once per cadence: answering or dismissing keeps it away for 90 days', async () => {
    const { dispatchNpsSurveys } = await import('../../../services/feedback.service.js');
    const eligible = async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/nps-eligibility' });
      expect(response.statusCode, response.body).toBe(200);
      return response.json().eligible as boolean;
    };
    expect(await eligible()).toBe(false);
    expect(await dispatchNpsSurveys({ prisma: db.prisma as never, log: app.log })).toEqual({ checked: 2, marked: 2 });
    expect(await eligible()).toBe(true);
    await app.inject({ method: 'POST', url: '/api/v1/tenants/me/nps-prompt', payload: { event: 'SHOWN' } });
    await app.inject({ method: 'POST', url: '/api/v1/tenants/me/feedback', payload: { type: 'NPS', score: 9 } });
    expect(await eligible()).toBe(false);
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    db.users.forEach((user) => (user.lastLogin = in30Days));
    await dispatchNpsSurveys({ prisma: db.prisma as never, log: app.log }, in30Days);
    expect(db.prompts.find((row) => row.userId === 'u_admin')).toMatchObject({ eligibleAt: null });
    const in91Days = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);
    db.users.forEach((user) => (user.lastLogin = in91Days));
    await dispatchNpsSurveys({ prisma: db.prisma as never, log: app.log }, in91Days);
    expect(db.prompts.find((row) => row.userId === 'u_admin')?.eligibleAt).toEqual(in91Days);

    tenantUser.sub = 'u_staff';
    await app.inject({ method: 'POST', url: '/api/v1/tenants/me/nps-prompt', payload: { event: 'DISMISSED' } });
    expect(await eligible()).toBe(false);
  });

  it('only tenant staff can send feedback', async () => {
    tenantUser.role = 'CUSTOMER_USER';
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenants/me/feedback', payload: { type: 'GENERAL', title: 'Hello there' } })).statusCode).toBe(403);
  });
});
