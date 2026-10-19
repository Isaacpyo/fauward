import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// L8 announcements (WP-2.14) over an in-memory store: targeting, receipts (one per user per action), edit/archive
// reaching tenants, alsoEmail fan-out, delete only before receipts.

const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>) => ({ id: 'job' })));
vi.mock('../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, bullmqConnection: {} }));
vi.mock('../../queues/python-services.js', () => ({ publishPythonServiceJob: vi.fn(async () => undefined) }));
vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_comms', email: 'comms@fauward.com', name: 'Comms', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(['customer.comms.read', 'customer.comms.send']), jit: new Map(), permissions: [] }))
}));
vi.mock('../../services/platform-audit.service.js', () => ({ writePlatformAuditLog: vi.fn(async () => ({ id: 'aud' })) }));

const TENANTS = [
  { id: 'tenant_a', plan: 'PRO', status: 'ACTIVE' },
  { id: 'tenant_b', plan: 'STARTER', status: 'ACTIVE' },
  { id: 'tenant_c', plan: 'PRO', status: 'CANCELLED' }
];
const USERS = [
  { id: 'u_a_admin', tenantId: 'tenant_a', role: 'TENANT_ADMIN', email: 'admin@a.test', isActive: true },
  { id: 'u_a_staff', tenantId: 'tenant_a', role: 'TENANT_STAFF', email: 'ops@a.test', isActive: true },
  { id: 'u_b_admin', tenantId: 'tenant_b', role: 'TENANT_ADMIN', email: 'admin@b.test', isActive: true },
  { id: 'u_c_admin', tenantId: 'tenant_c', role: 'TENANT_ADMIN', email: 'admin@c.test', isActive: true }
];

type Row = Record<string, unknown>;

/** Enough of Prisma's where semantics for these queries. */
function matches(row: Row, where: Row | undefined, related: (row: Row, relation: string) => Row[] = () => []): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Row[]).every((part) => matches(row, part, related));
    if (key === 'OR') return (condition as Row[]).some((part) => matches(row, part, related));
    if (key === 'receipts') {
      const none = (condition as { none: Row }).none;
      return !related(row, 'receipts').some((receipt) => matches(receipt, none));
    }
    if (key === 'tenant') {
      const tenant = TENANTS.find((item) => item.id === row.tenantId)!;
      return matches(tenant, condition as Row, related);
    }
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
      const ops = condition as { in?: unknown[]; not?: unknown; has?: unknown; lte?: Date; gt?: Date; isEmpty?: boolean };
      if (ops.in) return ops.in.includes(value);
      if ('not' in ops) return ops.not === null ? value !== null && value !== undefined : value !== ops.not;
      if ('has' in ops) return Array.isArray(value) && value.includes(ops.has);
      if (ops.lte) return value instanceof Date && value <= ops.lte;
      if (ops.gt) return value instanceof Date && value > ops.gt;
      return true;
    }
    return value === condition;
  });
}

function createStore() {
  const announcements: Row[] = [];
  const receipts: Row[] = [];
  const activity: Row[] = [];
  const related = (row: Row, relation: string) => (relation === 'receipts' ? receipts.filter((receipt) => receipt.announcementId === row.id) : []);
  const prisma = {
    announcements,
    receipts,
    activity,
    platformAnnouncement: {
      findMany: vi.fn(async ({ where }: { where?: Row }) => announcements.filter((row) => matches(row, where, related)).sort((a, b) => (b.publishedAt as Date).getTime() - (a.publishedAt as Date).getTime())),
      findFirst: vi.fn(async ({ where }: { where: Row }) => announcements.find((row) => matches(row, where, related)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => announcements.find((row) => row.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const now = new Date();
        const row = { id: `ann_${announcements.length + 1}`, type: 'INFO', targetAll: true, tenantIds: [], planTiers: [], cta: null, dismissible: true, publishedAt: now, expiresAt: null, archivedAt: null, alsoEmail: false, updatedAt: now, ...data };
        announcements.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(announcements.find((row) => row.id === where.id)!, data, { updatedAt: new Date() })),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => announcements.splice(announcements.findIndex((row) => row.id === where.id), 1)[0])
    },
    announcementReceipt: {
      findUnique: vi.fn(async ({ where }: { where: { announcementId_userId: { announcementId: string; userId: string } } }) => receipts.find((row) => row.announcementId === where.announcementId_userId.announcementId && row.userId === where.announcementId_userId.userId) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: `rcpt_${receipts.length + 1}`, dismissedAt: null, ctaClickedAt: null, ...data };
        receipts.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(receipts.find((row) => row.id === where.id)!, data)),
      count: vi.fn(async ({ where }: { where: Row }) => receipts.filter((row) => matches(row, where)).length),
      groupBy: vi.fn(async ({ where }: { where: Row }) => {
        const counts = new Map<string, number>();
        for (const row of receipts.filter((item) => matches(item, where))) counts.set(String(row.announcementId), (counts.get(String(row.announcementId)) ?? 0) + 1);
        return [...counts].map(([announcementId, count]) => ({ announcementId, _count: { _all: count } }));
      })
    },
    tenant: { count: vi.fn(async ({ where }: { where: Row }) => TENANTS.filter((row) => matches(row, where)).length) },
    user: {
      count: vi.fn(async ({ where }: { where: Row }) => USERS.filter((row) => matches(row, where)).length),
      findMany: vi.fn(async ({ where }: { where: Row }) => USERS.filter((row) => matches(row, where)))
    },
    platformActivity: {
      upsert: vi.fn(async ({ create }: { create: Row }) => {
        activity.push(create);
        return { id: `act_${activity.length}`, ...create };
      })
    }
  };
  return prisma;
}

let store: ReturnType<typeof createStore>;
const openApps: FastifyInstance[] = [];

async function buildApp() {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', store as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerAnnouncementRoutes } = await import('./announcements.routes.js');
  await registerAnnouncementRoutes(app);
  return app;
}

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: FastifyRequest) => {
    const user = USERS.find((item) => item.id === request.headers['x-test-user']) ?? USERS[0];
    const tenant = TENANTS.find((item) => item.id === user.tenantId)!;
    request.user = { sub: user.id, email: user.email, role: user.role, tenantId: tenant.id, tenantSlug: tenant.id, plan: tenant.plan, mfaVerified: true };
    request.tenant = tenant as never;
  }
}));

const tenantList = async (app: FastifyInstance, user: string) =>
  ((await app.inject({ method: 'GET', url: '/api/v1/tenants/me/announcements', headers: { 'x-test-user': user } })).json() as { announcements: Array<{ id: string; title: string }> }).announcements;

beforeEach(() => {
  store = createStore();
  queueAdd.mockClear();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('L8 announcements (WP-2.14)', () => {
  it('ACC-COM-1 a targeted announcement shows only for targeted tenants; the audience preview counts tenants and users', async () => {
    const app = await buildApp();
    const preview = await app.inject({ method: 'GET', url: '/api/internal/announcements/audience-preview?planTiers=PRO' });
    // tenant_c is PRO but CANCELLED: not in the audience.
    expect(preview.json()).toEqual({ tenants: 1, users: 2 });
    const created = await app.inject({ method: 'POST', url: '/api/internal/announcements', payload: { title: 'Pro webinar', body: 'Join us on Thursday', targetAll: false, planTiers: ['PRO'] } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ state: 'ACTIVE', audience: { tenants: 1, users: 2 }, email: null });
    expect(store.activity).toEqual([expect.objectContaining({ service: 'customer.comms', type: 'announcement.published' })]);
    expect((await tenantList(app, 'u_a_staff')).map((row) => row.title)).toEqual(['Pro webinar']);
    expect(await tenantList(app, 'u_b_admin')).toEqual([]);
    expect((await app.inject({ method: 'POST', url: '/api/internal/announcements', payload: { title: 'x', body: 'y', targetAll: false } })).statusCode).toBe(400);
  });

  it('ACC-L8-1 ACC-COM-2 receipts: one per user, each action once, dismissed hides it for that user, summarised in the console', async () => {
    const app = await buildApp();
    const { id } = (await app.inject({ method: 'POST', url: '/api/internal/announcements', payload: { title: 'Maintenance', body: 'Saturday 02:00 UTC', targetAll: true, cta: { label: 'Details', url: 'https://status.fauward.com' } } })).json() as { id: string };
    const receipt = (user: string, action: string) => app.inject({ method: 'POST', url: `/api/v1/tenants/me/announcements/${id}/receipt`, headers: { 'x-test-user': user }, payload: { action } });
    expect((await receipt('u_a_admin', 'VIEWED')).statusCode).toBe(204);
    await receipt('u_a_admin', 'VIEWED');
    await receipt('u_a_admin', 'CTA_CLICKED');
    await receipt('u_a_admin', 'CTA_CLICKED');
    await receipt('u_a_staff', 'VIEWED');
    await receipt('u_a_staff', 'DISMISSED');
    await receipt('u_b_admin', 'DISMISSED');
    expect((await receipt('u_a_admin', 'OPENED')).statusCode).toBe(400);
    expect(store.receipts).toHaveLength(3);
    expect(await tenantList(app, 'u_a_staff')).toEqual([]);
    expect((await tenantList(app, 'u_a_admin')).map((row) => row.id)).toEqual([id]);
    const list = await app.inject({ method: 'GET', url: '/api/internal/announcements' });
    expect(list.json()).toMatchObject({ data: [{ id, receipts: { viewed: 3, dismissed: 2, ctaClicked: 1 } }] });
    const detail = await app.inject({ method: 'GET', url: `/api/internal/announcements/${id}` });
    expect(detail.json()).toMatchObject({ receipts: { viewed: 3, dismissed: 2, ctaClicked: 1 }, audience: { tenants: 2, users: 3 } });
  });

  it('ACC-COM-3 an edit and an archive reach tenants on their next fetch; archived ones cannot be edited', async () => {
    const app = await buildApp();
    const { id } = (await app.inject({ method: 'POST', url: '/api/internal/announcements', payload: { title: 'Old title', body: 'Body', targetAll: true } })).json() as { id: string };
    expect((await app.inject({ method: 'PATCH', url: `/api/internal/announcements/${id}`, payload: { title: 'New title' } })).statusCode).toBe(200);
    expect((await tenantList(app, 'u_b_admin')).map((row) => row.title)).toEqual(['New title']);
    expect((await app.inject({ method: 'POST', url: `/api/internal/announcements/${id}/archive` })).json()).toMatchObject({ state: 'ARCHIVED' });
    expect(await tenantList(app, 'u_b_admin')).toEqual([]);
    expect(store.activity.map((row) => row.type)).toEqual(['announcement.published', 'announcement.archived']);
    expect((await app.inject({ method: 'PATCH', url: `/api/internal/announcements/${id}`, payload: { title: 'Again' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: '/api/internal/announcements?status=archived' })).json().data).toHaveLength(1);
  });

  it('ACC-COM-4 alsoEmail enqueues one email per targeted tenant admin; scheduled announcements cannot email', async () => {
    const app = await buildApp();
    const created = await app.inject({ method: 'POST', url: '/api/internal/announcements', payload: { title: 'New pricing', body: 'From 1 December', targetAll: true, alsoEmail: true } });
    expect(created.json()).toMatchObject({ email: { queued: 2, failed: 0 } });
    expect(queueAdd.mock.calls.map(([, job]) => [job.to, job.template]).sort()).toEqual([
      ['admin@a.test', 'platform_announcement'],
      ['admin@b.test', 'platform_announcement']
    ]);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await app.inject({ method: 'POST', url: '/api/internal/announcements', payload: { title: 'Later', body: 'Soon', targetAll: true, alsoEmail: true, publishedAt: future } })).statusCode).toBe(400);
    const scheduled = await app.inject({ method: 'POST', url: '/api/internal/announcements', payload: { title: 'Later', body: 'Soon', targetAll: true, publishedAt: future } });
    expect(scheduled.json()).toMatchObject({ state: 'SCHEDULED' });
    expect((await tenantList(app, 'u_a_admin')).map((row) => row.title)).toEqual(['New pricing']);
  });

  it('delete is dangerous and only allowed before anyone saw the announcement', async () => {
    const app = await buildApp();
    const { id } = (await app.inject({ method: 'POST', url: '/api/internal/announcements', payload: { title: 'Typo', body: 'Body', targetAll: true } })).json() as { id: string };
    await app.inject({ method: 'POST', url: `/api/v1/tenants/me/announcements/${id}/receipt`, headers: { 'x-test-user': 'u_a_admin' }, payload: { action: 'VIEWED' } });
    expect((await app.inject({ method: 'DELETE', url: `/api/internal/announcements/${id}`, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: `/api/internal/announcements/${id}`, payload: { reason: 'Posted by mistake' } })).statusCode).toBe(409);
    const { id: fresh } = (await app.inject({ method: 'POST', url: '/api/internal/announcements', payload: { title: 'Typo 2', body: 'Body', targetAll: true } })).json() as { id: string };
    expect((await app.inject({ method: 'DELETE', url: `/api/internal/announcements/${fresh}`, payload: { reason: 'Posted by mistake' } })).statusCode).toBe(204);
  });
});
