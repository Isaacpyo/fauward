import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// L15 escalation loop (WP-2.11) over an in-memory store: tenant escalates an exception → CRITICAL activity + staff
// notification → console assigns, replies, resolves → the tenant sees the reply and the status, and is notified.

type Row = Record<string, unknown> & { id: string };
const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>) => ({ id: 'job' })));
let consolePermissions = new Set<string>(['platform.incidents.read', 'platform.incidents.write']);

vi.mock('../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, bullmqConnection: {} }));
vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_ops', email: 'olu@fauward.com', name: 'Olu Ops', status: 'ACTIVE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: consolePermissions, jit: new Map(), permissions: [...consolePermissions] }))
}));
vi.mock('../../services/platform-audit.service.js', () => ({ writePlatformAuditLog: vi.fn(async () => ({ id: 'aud' })) }));

const USERS: Record<string, { sub: string; role: string; email: string }> = {
  admin: { sub: 'u_admin', role: 'TENANT_ADMIN', email: 'admin@northwind.test' },
  staff: { sub: 'u_staff', role: 'TENANT_STAFF', email: 'ops@northwind.test' },
  customer: { sub: 'u_cust', role: 'CUSTOMER_USER', email: 'buyer@acme.test' }
};

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Array<Record<string, unknown>>).some((branch) => matches(row, branch));
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const ops = condition as { in?: unknown[]; not?: unknown };
      if (ops.in) return ops.in.includes(value);
      if ('not' in ops) return ops.not === null ? value !== null && value !== undefined : value !== ops.not;
      return true;
    }
    return value === condition;
  });
}

function createStore() {
  const now = new Date('2026-10-19T09:00:00Z');
  const tenant = { id: 'tenant_a', name: 'Northwind', slug: 'northwind' };
  const cases: Row[] = [
    { id: 'exc_1', tenantId: 'tenant_a', shipmentId: 'sh_1', type: 'STUCK', severity: 'HIGH', status: 'OPEN', assignedTo: null, aiDiagnosis: null, notes: null, resolvedAt: null, createdAt: now, updatedAt: now, escalatedAt: null, escalatedByUserId: null, escalationReason: null, platformAssigneeId: null, platformResolvedAt: null },
    { id: 'exc_other', tenantId: 'tenant_b', shipmentId: null, type: 'DAMAGED', severity: 'LOW', status: 'OPEN', assignedTo: null, aiDiagnosis: null, notes: null, resolvedAt: null, createdAt: now, updatedAt: now, escalatedAt: null, escalatedByUserId: null, escalationReason: null, platformAssigneeId: null, platformResolvedAt: null }
  ];
  const replies: Row[] = [];
  const activity: Row[] = [];
  const inApp: Row[] = [];
  const staffNotifications: Row[] = [];
  const users = [
    { id: 'u_admin', tenantId: 'tenant_a', email: 'admin@northwind.test', role: 'TENANT_ADMIN', isActive: true },
    { id: 'u_staff', tenantId: 'tenant_a', email: 'ops@northwind.test', role: 'TENANT_STAFF', isActive: true }
  ];
  const withIncludes = (row: Row | undefined, include?: Record<string, unknown>) => {
    if (!row) return null;
    const out: Row = { ...row };
    if (include?.tenant) out.tenant = row.tenantId === 'tenant_a' ? tenant : { id: 'tenant_b', name: 'Other', slug: 'other' };
    if (include?.shipment) out.shipment = row.shipmentId ? { id: row.shipmentId, trackingNumber: 'NWD-1001', status: 'IN_TRANSIT' } : null;
    if (include?.escalationReplies) out.escalationReplies = replies.filter((reply) => reply.exceptionId === row.id && reply.tenantId === row.tenantId);
    return out;
  };
  const prisma = {
    cases,
    replies,
    activity,
    inApp,
    staffNotifications,
    tenant: { findUnique: vi.fn(async () => tenant) },
    exceptionCase: {
      findMany: vi.fn(async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => cases.filter((row) => matches(row, where)).map((row) => withIncludes(row, include))),
      findFirst: vi.fn(async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => withIncludes(cases.find((row) => matches(row, where)), include)),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => cases.filter((row) => matches(row, where)).length),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = cases.filter((row) => matches(row, where));
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      })
    },
    exceptionEscalationReply: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `rep_${replies.length + 1}`, createdAt: new Date(), ...data };
        replies.push(row);
        return row;
      })
    },
    platformUser: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'pu_ops' ? { id: 'pu_ops', status: 'ACTIVE' } : null)),
      findMany: vi.fn(async () => [])
    },
    staffUser: { findMany: vi.fn(async () => [{ platformUserId: 'pu_ops' }]) },
    staffNotification: { createMany: vi.fn(async ({ data }: { data: Row[] }) => staffNotifications.push(...data)) },
    platformActivity: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        const row = { id: `act_${activity.length + 1}`, ...create };
        activity.push(row);
        return row;
      })
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; role: string } }) => users.filter((user) => user.tenantId === where.tenantId && user.role === where.role)),
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => users.find((user) => user.id === where.id && user.tenantId === where.tenantId) ?? null)
    },
    inAppNotification: { createMany: vi.fn(async ({ data }: { data: Row[] }) => inApp.push(...data)) },
    notificationLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'log', ...data })) }
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
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const user = USERS[String(request.headers['x-test-user'] ?? 'staff')];
    request.user = { ...user, tenantId: 'tenant_a', tenantSlug: 'northwind', plan: 'PRO', mfaVerified: true };
    request.tenant = { id: 'tenant_a', slug: 'northwind' } as never;
  });
  const { registerExceptionsRoutes } = await import('./exceptions.routes.js');
  const { registerConsoleEscalationRoutes } = await import('../internal/platform/escalations.routes.js');
  await registerExceptionsRoutes(app);
  await registerConsoleEscalationRoutes(app);
  return app;
}

beforeEach(() => {
  store = createStore();
  queueAdd.mockClear();
  consolePermissions = new Set(['platform.incidents.read', 'platform.incidents.write']);
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('L15 exception escalation loop (WP-2.11)', () => {
  it('ACC-L15-1 escalate → CRITICAL activity + staff bell → assign, reply, resolve → tenant sees the reply and status and is notified', async () => {
    const app = await buildApp();
    const tooShort = await app.inject({ method: 'POST', url: '/api/v1/tenant/exceptions/exc_1/escalate', payload: { reason: 'help' } });
    expect(tooShort.statusCode).toBe(400);

    const escalated = await app.inject({ method: 'POST', url: '/api/v1/tenant/exceptions/exc_1/escalate', payload: { reason: 'Carrier lost the pallet, customer is chasing us' } });
    expect(escalated.statusCode).toBe(200);
    expect(escalated.json()).toMatchObject({ id: 'exc_1', escalation: { state: 'OPEN', reason: 'Carrier lost the pallet, customer is chasing us', replies: [] } });
    expect(escalated.json()).not.toHaveProperty('escalatedByUserId');
    expect(store.activity).toEqual([expect.objectContaining({ service: 'platform.incidents', type: 'exception.escalated', tenantId: 'tenant_a', severity: 'CRITICAL', actorType: 'TENANT_USER', actorId: 'u_staff' })]);
    expect(store.staffNotifications).toEqual([expect.objectContaining({ platformUserId: 'pu_ops', event: 'exception.escalated', severity: 'CRITICAL', tenantId: 'tenant_a' })]);
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenant/exceptions/exc_1/escalate', payload: { reason: 'Escalating a second time please' } })).statusCode).toBe(409);

    const queue = await app.inject({ method: 'GET', url: '/api/internal/operations/escalations' });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({ total: 1, data: [{ id: 'exc_1', tenant: { name: 'Northwind' }, shipment: { trackingNumber: 'NWD-1001' }, state: 'OPEN' }] });

    const assigned = await app.inject({ method: 'PATCH', url: '/api/internal/operations/escalations/exc_1', payload: { platformAssigneeId: 'pu_ops' } });
    expect(assigned.json()).toMatchObject({ platformAssigneeId: 'pu_ops' });
    const replied = await app.inject({ method: 'PATCH', url: '/api/internal/operations/escalations/exc_1', payload: { reply: 'We have opened a trace with the carrier; update within 24h.' } });
    expect(replied.statusCode).toBe(200);
    expect(store.activity.map((row) => row.type)).toContain('exception.escalation_replied');
    // Tenant admin + the escalating staff user get the reply in-app and by email.
    expect(store.inApp.filter((row) => row.type === 'exception.escalation_replied').map((row) => row.userId).sort()).toEqual(['u_admin', 'u_staff']);
    expect(queueAdd.mock.calls.map(([, job]) => job.template)).toEqual(['exception_escalation_update', 'exception_escalation_update']);

    const tenantView = await app.inject({ method: 'GET', url: '/api/v1/tenant/exceptions/exc_1' });
    expect(tenantView.json()).toMatchObject({ escalation: { state: 'OPEN', replies: [{ author: 'Olu Ops (Fauward)', body: 'We have opened a trace with the carrier; update within 24h.' }] } });
    expect(JSON.stringify(tenantView.json())).not.toContain('pu_ops');

    const resolved = await app.inject({ method: 'PATCH', url: '/api/internal/operations/escalations/exc_1', payload: { resolve: true } });
    expect(resolved.json()).toMatchObject({ state: 'RESOLVED' });
    expect(store.activity.map((row) => row.type)).toContain('exception.escalation_resolved');
    const list = await app.inject({ method: 'GET', url: '/api/v1/tenant/exceptions' });
    expect(list.json()).toMatchObject({ data: [{ id: 'exc_1', escalation: { state: 'RESOLVED' } }] });
    expect((await app.inject({ method: 'PATCH', url: '/api/internal/operations/escalations/exc_1', payload: { reply: 'late reply' } })).statusCode).toBe(409);
  });

  it('tenants only reach their own exceptions; customers of the tenant cannot see or escalate them', async () => {
    const app = await buildApp();
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenant/exceptions/exc_other/escalate', payload: { reason: 'Not my exception at all' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/tenant/exceptions', headers: { 'x-test-user': 'customer' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenant/exceptions/exc_1/escalate', headers: { 'x-test-user': 'customer' }, payload: { reason: 'Customers cannot escalate' } })).statusCode).toBe(403);
    expect(store.activity).toEqual([]);
  });

  it('console escalation routes need platform.incidents.read / .write', async () => {
    consolePermissions = new Set(['platform.tenants.read']);
    const app = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/api/internal/operations/escalations' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/internal/operations/control-tower/health' })).statusCode).toBe(403);
    consolePermissions = new Set(['platform.incidents.read']);
    expect((await app.inject({ method: 'PATCH', url: '/api/internal/operations/escalations/exc_1', payload: { resolve: true } })).statusCode).toBe(403);
  });
});
