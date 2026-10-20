import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// trust.safety (WP-2.4, L3) over an in-memory store with the real TenantSuspensionService: signals, suspensions and the
// appeal loop (submit → approve / reject / request info → tenant answer).

type Row = Record<string, unknown> & { id: string };
const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>) => ({ id: 'job' })));
const consoleSession = vi.hoisted(() => ({ mfaVerifiedAt: new Date() as Date | null }));

vi.mock('../../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, bullmqConnection: {} }));
vi.mock('../../../queues/python-services.js', () => ({ publishPythonServiceJob: vi.fn(async () => undefined) }));
vi.mock('../internal-audit.js', () => ({ writeInternalAudit: vi.fn(async () => undefined) }));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(['trust.safety.read', 'trust.safety.suspend']), jit: new Map(), permissions: [] }))
}));
vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_safety', email: 'sam@fauward.com', name: 'Sam Safety', role: 'PLATFORM_SUPPORT', status: 'ACTIVE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: consoleSession.mfaVerifiedAt } };
  }
}));

const store = vi.hoisted(() => ({ current: null as null | { tenants: Row[] } }));
vi.mock('../../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: 'u_admin', role: 'TENANT_ADMIN', tenantId: 'tenant_a', email: 'admin@northwind.test' };
    request.tenant = { ...store.current!.tenants[0] };
  }
}));

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const ops = condition as { in?: unknown[]; not?: unknown };
      if (ops.in) return ops.in.includes(value);
      if ('not' in ops) return value !== ops.not;
      return true;
    }
    return value === condition;
  });
}

function table(rows: Row[], prefix: string) {
  let seq = 0;
  const sorted = (list: Row[]) => [...list].sort((a, b) => ((b.createdAt as Date)?.getTime() ?? 0) - ((a.createdAt as Date)?.getTime() ?? 0));
  return {
    create: vi.fn(async ({ data }: { data: Omit<Row, 'id'> & { id?: string } }) => {
      seq += 1;
      const row: Row = { createdAt: new Date(Date.now() + seq), updatedAt: new Date(), ...data, id: data.id ?? `${prefix}_${seq}` };
      rows.push(row);
      return { ...row };
    }),
    findUnique: vi.fn(async ({ where }: { where: Row }) => rows.find((row) => matches(row, where)) ?? null),
    findFirst: vi.fn(async ({ where }: { where?: Row }) => sorted(rows).find((row) => matches(row, where ?? {})) ?? null),
    findMany: vi.fn(async ({ where, take }: { where?: Record<string, unknown>; take?: number }) => sorted(rows).filter((row) => matches(row, where ?? {})).slice(0, take ?? 1000)),
    count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => rows.filter((row) => matches(row, where ?? {})).length),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows.find((item) => matches(item, where))!;
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
      const hits = rows.filter((row) => matches(row, where));
      for (const row of hits) Object.assign(row, data);
      return { count: hits.length };
    })
  };
}

function createStore() {
  const tenants: Row[] = [{ id: 'tenant_a', name: 'Northwind', slug: 'northwind', status: 'ACTIVE', suspendedAt: null, suspensionReason: null, closedAt: null }];
  const data = { tenants, suspensions: [] as Row[], appeals: [] as Row[], signals: [] as Row[], audit: [] as Row[], activity: [] as Row[], inApp: [] as Row[], staffNotifications: [] as Row[] };
  const prisma: Record<string, unknown> = {
    tenant: table(tenants, 'tenant'),
    suspensionRecord: table(data.suspensions, 'sus'),
    tenantAppeal: table(data.appeals, 'appeal'),
    fraudSignal: table(data.signals, 'sig'),
    platformAuditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async ({ data: row }: { data: Row }) => data.audit.push(row)) },
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Row }) => {
        const existing = data.activity.find((row) => row.dedupeKey === where.dedupeKey);
        if (existing) return existing;
        const row = { ...create, id: `act_${data.activity.length + 1}` };
        data.activity.push(row);
        return row;
      })
    },
    user: { findMany: vi.fn(async () => [{ id: 'u_admin', email: 'admin@northwind.test' }]) },
    inAppNotification: { createMany: vi.fn(async ({ data: rows }: { data: Row[] }) => data.inApp.push(...rows)) },
    staffUser: { findMany: vi.fn(async () => [{ platformUserId: 'pu_safety' }]) },
    staffNotification: { createMany: vi.fn(async ({ data: rows }: { data: Row[] }) => data.staffNotifications.push(...rows)) },
    platformUser: { findMany: vi.fn(async () => [{ id: 'pu_safety', email: 'sam@fauward.com' }]) }
  };
  prisma.$transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma));
  return { prisma, ...data };
}

let db: ReturnType<typeof createStore>;
let app: FastifyInstance;
const REASON = 'Reviewed the evidence with the payments team';

beforeEach(async () => {
  queueAdd.mockClear();
  consoleSession.mfaVerifiedAt = new Date();
  db = createStore();
  store.current = db;
  app = Fastify();
  app.decorate('prisma', db.prisma as never);
  app.decorate('redis', { publish: vi.fn(async () => 1), del: vi.fn(async () => 1) } as never);
  const { registerConsoleSafetyRoutes } = await import('./safety.routes.js');
  const { registerAppealRoutes } = await import('../../appeals/appeals.routes.js');
  await registerConsoleSafetyRoutes(app);
  await registerAppealRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

async function flagAndSuspend(category: 'FRAUD' | 'AUP' = 'FRAUD') {
  const created = await app.inject({ method: 'POST', url: '/api/internal/safety/signals', payload: { tenantId: 'tenant_a', category, severity: 'HIGH', summary: 'Card testing pattern on the booking API' } });
  expect(created.statusCode).toBe(201);
  const signalId = created.json().signal.id as string;
  const decided = await app.inject({ method: 'POST', url: `/api/internal/safety/signals/${signalId}/decision`, payload: { decision: 'SUSPEND', reason: REASON, tenantMessage: 'Unusual payment activity is under review.' } });
  expect(decided.statusCode).toBe(200);
  return { signalId, suspensionId: decided.json().suspensionId as string };
}

async function appeal() {
  const response = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/suspension-appeal', payload: { reason: 'The flagged payments were one customer retrying a declined card several times in a row.', contactEmail: 'admin@northwind.test' } });
  expect(response.statusCode).toBe(201);
  return response.json().appeal.id as string;
}

describe('trust.safety (WP-2.4)', () => {
  it('ACC-SAF-4 a SUSPEND decision creates a record with suspendedAt and the reason, linked to the signal', async () => {
    const { signalId, suspensionId } = await flagAndSuspend();
    expect(db.suspensions).toEqual([expect.objectContaining({ id: suspensionId, source: 'FRAUD', category: 'FRAUD', reason: REASON, publicReason: 'Unusual payment activity is under review.', sourceRef: signalId, status: 'ACTIVE' })]);
    expect(db.tenants[0]).toMatchObject({ status: 'SUSPENDED', suspensionReason: 'Unusual payment activity is under review.' });
    expect(db.tenants[0].suspendedAt).toBeInstanceOf(Date);
    expect(db.signals[0]).toMatchObject({ status: 'CLOSED', decision: 'SUSPEND' });
    expect((await app.inject({ method: 'POST', url: `/api/internal/safety/signals/${signalId}/decision`, payload: { decision: 'DISMISS', reason: REASON } })).statusCode).toBe(409);
  });

  it('ACC-SAF-1 ACC-SAF-2 ACC-L3-1 appeal → staff notified → approve lifts the linked suspension; the tenant is ACTIVE and told', async () => {
    const { suspensionId } = await flagAndSuspend();
    db.staffNotifications.length = 0;
    const appealId = await appeal();
    expect(db.appeals[0]).toMatchObject({ suspensionId, status: 'PENDING' });
    expect(db.staffNotifications).toEqual([expect.objectContaining({ platformUserId: 'pu_safety', event: 'appeal.submitted' })]);
    expect(db.activity.map((row) => row.type)).toContain('appeal.submitted');
    queueAdd.mockClear();
    db.inApp.length = 0;

    const decided = await app.inject({ method: 'POST', url: `/api/internal/safety/appeals/${appealId}/decision`, payload: { decision: 'APPROVE', reason: REASON, message: 'Thanks — the activity checks out.', suspensionId: 'susp_from_client' } });
    expect(decided.statusCode).toBe(200);
    expect(decided.json()).toMatchObject({ tenantReactivated: true, appeal: { status: 'APPROVED' } });
    expect(db.suspensions[0]).toMatchObject({ id: suspensionId, status: 'LIFTED', liftedVia: 'APPEAL' });
    expect(db.tenants[0]).toMatchObject({ status: 'ACTIVE', suspendedAt: null });
    expect(db.inApp.map((row) => row.type)).toEqual(expect.arrayContaining(['tenant.unsuspended', 'appeal.decided']));
    expect(queueAdd.mock.calls.map(([, job]) => job.template)).toEqual(expect.arrayContaining(['tenant_unsuspended', 'appeal_decided']));
    expect(db.activity.map((row) => row.type)).toEqual(expect.arrayContaining(['tenant.unsuspended', 'appeal.decided']));
  });

  it('ACC-SAF-2 approving lifts only the appealed cause; with a second cause the tenant stays suspended', async () => {
    await flagAndSuspend('FRAUD');
    await flagAndSuspend('AUP');
    const appealId = await appeal();
    await app.inject({ method: 'POST', url: `/api/internal/safety/appeals/${appealId}/decision`, payload: { decision: 'APPROVE', reason: REASON } });
    expect(db.suspensions.map((row) => row.status).sort()).toEqual(['ACTIVE', 'LIFTED']);
    expect(db.tenants[0].status).toBe('SUSPENDED');
  });

  it('ACC-SAF-3 ACC-L3-2 a rejection shows its resolution in the tenant overlay', async () => {
    await flagAndSuspend();
    const appealId = await appeal();
    const rejected = await app.inject({ method: 'POST', url: `/api/internal/safety/appeals/${appealId}/decision`, payload: { decision: 'REJECT', reason: REASON, message: 'The chargebacks came from accounts your team created.' } });
    expect(rejected.statusCode).toBe(200);
    const overlay = (await app.inject({ method: 'GET', url: '/api/v1/tenants/me/suspension' })).json();
    // A rejected appeal can be followed by a new one (only a pending appeal blocks appealing, D3).
    expect(overlay).toMatchObject({ suspended: true, appealable: true, appeal: { status: 'REJECTED', resolution: 'The chargebacks came from accounts your team created.' } });
    expect(overlay.appeal.decidedAt).not.toBeNull();
    expect(db.tenants[0].status).toBe('SUSPENDED');
  });

  it('REQUEST_INFO asks the tenant a question; the answer returns the appeal to PENDING and alerts staff', async () => {
    await flagAndSuspend();
    const appealId = await appeal();
    await app.inject({ method: 'POST', url: `/api/internal/safety/appeals/${appealId}/decision`, payload: { decision: 'REQUEST_INFO', reason: REASON, message: 'Which customer made the retried payments?' } });
    let overlay = (await app.inject({ method: 'GET', url: '/api/v1/tenants/me/suspension' })).json();
    expect(overlay.appeal).toMatchObject({ status: 'INFO_REQUESTED', question: 'Which customer made the retried payments?', canReply: true });
    db.staffNotifications.length = 0;
    const answered = await app.inject({ method: 'POST', url: `/api/v1/tenants/me/suspension-appeal/${appealId}/reply`, payload: { message: 'Acme Retail, account 4411 — they confirmed by email.' } });
    expect(answered.statusCode).toBe(200);
    overlay = (await app.inject({ method: 'GET', url: '/api/v1/tenants/me/suspension' })).json();
    expect(overlay.appeal).toMatchObject({ status: 'PENDING', question: null, canReply: false, reply: 'Acme Retail, account 4411 — they confirmed by email.' });
    expect(db.staffNotifications).toEqual([expect.objectContaining({ event: 'appeal.replied' })]);
    expect(db.activity.map((row) => row.type)).toEqual(expect.arrayContaining(['appeal.info_requested', 'appeal.replied']));
    expect((await app.inject({ method: 'POST', url: `/api/v1/tenants/me/suspension-appeal/${appealId}/reply`, payload: { message: 'A second answer is not allowed.' } })).statusCode).toBe(409);
  });

  it('ACC-SAF-5 the suspensions list includes every source; a manual lift releases one cause', async () => {
    const { suspensionId } = await flagAndSuspend();
    db.suspensions.push({ id: 'sus_dunning', tenantId: 'tenant_a', source: 'DUNNING', category: 'BILLING', status: 'ACTIVE', reason: 'Stripe attempt 2', createdAt: new Date() });
    db.suspensions.push({ id: 'sus_platform', tenantId: 'tenant_a', source: 'PLATFORM', category: 'OTHER', status: 'ACTIVE', reason: 'Staff action', createdAt: new Date() });
    const list = (await app.inject({ method: 'GET', url: '/api/internal/safety/suspensions' })).json();
    expect(list.data.map((row: { source: string }) => row.source).sort()).toEqual(['DUNNING', 'FRAUD', 'PLATFORM']);
    expect(list.data[0].tenant).toMatchObject({ id: 'tenant_a', name: 'Northwind' });
    const lifted = await app.inject({ method: 'POST', url: `/api/internal/safety/suspensions/${suspensionId}/lift`, payload: { reason: REASON } });
    expect(lifted.json()).toMatchObject({ remaining: 2, tenantStatus: 'SUSPENDED' });
  });

  it('ACC-SAF-6 AUP reports are signals with category AUP; rules come from code', async () => {
    await app.inject({ method: 'POST', url: '/api/internal/safety/signals', payload: { tenantId: 'tenant_a', category: 'AUP', severity: 'MEDIUM', summary: 'Bulk unsolicited SMS reported by a carrier' } });
    const aup = (await app.inject({ method: 'GET', url: '/api/internal/safety/signals?category=AUP' })).json();
    expect(aup.data).toEqual([expect.objectContaining({ category: 'AUP', source: 'aup_report', summary: 'Bulk unsolicited SMS reported by a carrier', tenant: expect.objectContaining({ name: 'Northwind' }) })]);
    const rules = (await app.inject({ method: 'GET', url: '/api/internal/safety/rules' })).json();
    expect(rules.data.map((rule: { id: string }) => rule.id)).toEqual(['stripe-radar-warning', 'staff-failed-login-spike', 'dunning-suspend']);
    expect(rules.data[2].parameters).toEqual({ suspendOnAttempt: 2, cancelAfterDays: 30 });
  });

  it('decisions are dangerous: stale MFA → 403 MFA_REQUIRED, no reason → 400 REASON_REQUIRED', async () => {
    await flagAndSuspend();
    const appealId = await appeal();
    expect((await app.inject({ method: 'POST', url: `/api/internal/safety/appeals/${appealId}/decision`, payload: { decision: 'APPROVE' } })).json()).toMatchObject({ error: 'REASON_REQUIRED' });
    consoleSession.mfaVerifiedAt = new Date(Date.now() - 60 * 60 * 1000);
    const stale = await app.inject({ method: 'POST', url: `/api/internal/safety/appeals/${appealId}/decision`, payload: { decision: 'APPROVE', reason: REASON } });
    expect(stale.statusCode).toBe(403);
    expect(stale.json()).toMatchObject({ error: 'MFA_REQUIRED' });
    expect(db.appeals[0].status).toBe('PENDING');
  });
});
