import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_PERMISSIONS, Role, type Permission } from '@fauward/internal-rbac';

// trust.jit (WP-1.7). Uses the real requireConsolePermission + consolePermissionContext over an in-memory store, so an
// approval, an expiry and a revoke are observed through the same code path /auth/me and every console guard use.

type Staff = { platformUserId: string; staffId: string; email: string; permissions: Permission[] };
const STAFF: Record<string, Staff> = {
  pu_csm: { platformUserId: 'pu_csm', staffId: 'st_csm', email: 'csm@fauward.com', permissions: ['trust.jit.request', 'customer.360.read'] },
  pu_approver: { platformUserId: 'pu_approver', staffId: 'st_approver', email: 'sec@fauward.com', permissions: ['trust.jit.request', 'trust.jit.approve'] },
  pu_approver2: { platformUserId: 'pu_approver2', staffId: 'st_approver2', email: 'sec2@fauward.com', permissions: ['trust.jit.request', 'trust.jit.approve'] }
};

const auditActions: string[] = [];
const notifyStaffMock = vi.hoisted(() => vi.fn(async () => ({ inApp: 1 })));

vi.mock('@fauward/internal-audit', () => ({ writeAudit: vi.fn(async (_db: unknown, input: { action: string }) => { auditActions.push(input.action); }) }));
vi.mock('../../../services/platform-notifier.service.js', () => ({ notifyStaff: notifyStaffMock }));
vi.mock('../../../services/platform-activity.service.js', () => ({
  recordAndPublishActivity: vi.fn(async () => ({ id: 'act_1' })),
  staffActor: () => ({ actorType: 'STAFF', actorId: 'x', actorLabel: 'x' })
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { headers: Record<string, unknown>; platform?: unknown }) => {
    const staff = STAFF[String(request.headers['x-test-user'] ?? 'pu_csm')];
    request.platform = {
      user: { id: staff.platformUserId, email: staff.email, name: null, role: 'PLATFORM_SUPPORT', status: 'ACTIVE', mfaEnabled: true },
      session: { id: `ps_${staff.platformUserId}`, mfaVerifiedAt: new Date() }
    };
  }
}));

type Row = Record<string, unknown> & { id: string };

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const ops = condition as { gt?: Date; lte?: Date; in?: unknown[] };
      if (ops.in) return ops.in.includes(value);
      if (ops.gt) return value instanceof Date && value > ops.gt;
      if (ops.lte) return value instanceof Date && value <= ops.lte;
      return false;
    }
    return value === condition;
  });
}

function createStore() {
  const requests: Row[] = [];
  const approvals: Row[] = [];
  let seq = 0;
  const withApprovals = (row: Row | undefined, include?: unknown) =>
    row ? (include ? { ...row, approvals: approvals.filter((approval) => approval.requestId === row.id) } : { ...row }) : null;
  const prisma = {
    staffUser: {
      findUnique: vi.fn(async ({ where }: { where: { platformUserId?: string; email?: string } }) => {
        const staff = Object.values(STAFF).find((item) => item.platformUserId === where.platformUserId || item.email === where.email);
        if (!staff) return null;
        return { id: staff.staffId, platformUserId: staff.platformUserId, roleAssignments: [{ role: { id: 'TEST', permissions: staff.permissions } }] };
      })
    },
    platformUser: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        Object.values(STAFF).filter((staff) => where.id.in.includes(staff.platformUserId)).map((staff) => ({ id: staff.platformUserId, email: staff.email, name: null }))
      )
    },
    jitAccessRequest: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        seq += 1;
        const row: Row = { id: `jit_${seq}`, expiresAt: null, revokedAt: null, deniedReason: null, createdAt: new Date(Date.now() + seq), updatedAt: new Date(), ...data };
        requests.push(row);
        return { ...row };
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => requests.find((row) => matches(row, where)) ?? null),
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: unknown }) => withApprovals(requests.find((row) => row.id === where.id), include)),
      findMany: vi.fn(async ({ where, include }: { where?: Record<string, unknown>; include?: unknown }) =>
        requests.filter((row) => matches(row, where)).map((row) => withApprovals(row, include))
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hits = requests.filter((row) => matches(row, where));
        for (const row of hits) Object.assign(row, data, { updatedAt: new Date() });
        return { count: hits.length };
      })
    },
    jitAccessApproval: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        const existing = approvals.find((row) => row.requestId === create.requestId && row.approverPlatformUserId === create.approverPlatformUserId);
        if (existing) return existing;
        const row: Row = { id: `appr_${approvals.length + 1}`, createdAt: new Date(), ...create };
        approvals.push(row);
        return row;
      }),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => approvals.filter((row) => matches(row, where)).length)
    }
  };
  return { prisma, requests, approvals };
}

let store: ReturnType<typeof createStore>;
let app: FastifyInstance;

async function buildApp() {
  const instance = Fastify();
  instance.decorate('prisma', store.prisma as never);
  const { registerJitRoutes } = await import('./jit.routes.js');
  const { requireConsolePermission } = await import('../../../middleware/require-console-permission.js');
  const { authenticatePlatformSession } = await import('../../../middleware/authenticate-platform-session.js');
  await registerJitRoutes(instance);
  // A route the requester can only reach through the grant (stands in for any revenue.invoices.read console route).
  instance.get('/probe/invoices', { preHandler: [authenticatePlatformSession, requireConsolePermission('revenue.invoices.read')] }, async () => ({ ok: true }));
  await instance.ready();
  return instance;
}

const REASON = 'Investigating a disputed invoice for a tenant escalation';

function call(user: string, method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
  return app.inject({ method, url, headers: { 'x-test-user': user }, ...(payload ? { payload } : {}) });
}

async function requestAccess(user = 'pu_csm', payload: Record<string, unknown> = {}) {
  return call(user, 'POST', '/api/internal/jit/requests', { permission: 'revenue.invoices.read', reason: REASON, durationMinutes: 30, ...payload });
}

async function effectivePermissions(user: string) {
  const { consolePermissionContext } = await import('../../../services/staff-iam.service.js');
  const staff = STAFF[user];
  const context = await consolePermissionContext(store.prisma as never, { id: staff.platformUserId, email: staff.email, name: null, status: 'ACTIVE', mfaEnabled: true, lastLoginAt: null } as never);
  return context.permissions;
}

describe('trust.jit routes (WP-1.7)', () => {
  beforeEach(async () => {
    store = createStore();
    auditActions.length = 0;
    notifyStaffMock.mockClear();
    delete process.env.DEV_HARDWARE_KEY_ASSERTION;
    app = await buildApp();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  it('ACC-JIT-1 every role holds trust.jit.request and a support-level user can request; approvers other than the requester are notified', async () => {
    for (const role of Object.values(Role)) expect(ROLE_PERMISSIONS[role]).toContain('trust.jit.request');
    const response = await requestAccess();
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ permission: 'revenue.invoices.read', state: 'PENDING', ownRequest: true, requester: { email: 'csm@fauward.com' } });
    expect(notifyStaffMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ permission: 'trust.jit.approve', excludePlatformUserIds: ['pu_csm'], event: 'jit.requested' }));
    expect(auditActions).toContain('jit.request.create');
  });

  it('ACC-JIT-1 enforces the catalogue request rules: reason ≥ 20, duration ≤ 240, ROOT ≤ 60 with a hardware assertion', async () => {
    expect((await requestAccess('pu_csm', { reason: 'too short' })).json()).toMatchObject({ error: 'VALIDATION' });
    expect((await requestAccess('pu_csm', { durationMinutes: 300 })).statusCode).toBe(400);
    expect((await requestAccess('pu_csm', { permission: 'revenue.recognition.read' })).json()).toMatchObject({ error: 'UNKNOWN_PERMISSION' });
    expect((await requestAccess('pu_csm', { permission: 'customer.360.read' })).json()).toMatchObject({ error: 'ALREADY_HELD' });
    expect((await requestAccess('pu_csm', { permission: 'trust.iam.root', durationMinutes: 90 })).json()).toMatchObject({ error: 'VALIDATION' });
    expect((await requestAccess('pu_csm', { permission: 'trust.iam.root', durationMinutes: 60 })).statusCode).toBe(503);
    process.env.DEV_HARDWARE_KEY_ASSERTION = 'hw-assertion';
    expect((await requestAccess('pu_csm', { permission: 'trust.iam.root', durationMinutes: 60, hardwareKeyAssertion: 'wrong' })).statusCode).toBe(403);
    const root = await requestAccess('pu_csm', { permission: 'trust.iam.root', durationMinutes: 60, hardwareKeyAssertion: 'hw-assertion' });
    expect(root.statusCode).toBe(201);
    expect(root.json()).toMatchObject({ rootRequest: true, approvalsRequired: 2 });
    expect((await requestAccess()).statusCode).toBe(201);
    expect((await requestAccess()).json()).toMatchObject({ error: 'ALREADY_PENDING' });
    expect(store.requests).toHaveLength(2);
  });

  it('ACC-JIT-2 the requester cannot approve their own request, by PlatformUser id or by StaffUser id', async () => {
    const created = (await requestAccess('pu_approver')).json<{ id: string }>();
    const own = await call('pu_approver', 'POST', `/api/internal/jit/requests/${created.id}/approve`, { reason: 'approving my own request' });
    expect(own.statusCode).toBe(403);
    expect(own.json()).toMatchObject({ error: 'SELF_APPROVAL' });
    // Same staff member behind a different PlatformUser id (S3).
    store.requests[0].requesterPlatformUserId = 'pu_legacy_alias';
    store.requests[0].requesterStaffId = 'st_approver';
    expect((await call('pu_approver', 'POST', `/api/internal/jit/requests/${created.id}/approve`, { reason: 'approving my own request' })).statusCode).toBe(403);
    expect(store.approvals).toHaveLength(0);
  });

  it('ACC-JIT-3 an approval is in the effective permissions (/auth/me) on the next call and unlocks the matching route', async () => {
    expect((await call('pu_csm', 'GET', '/probe/invoices')).statusCode).toBe(403);
    const created = (await requestAccess()).json<{ id: string }>();
    expect(await effectivePermissions('pu_csm')).not.toContain('revenue.invoices.read');
    const approve = await call('pu_approver', 'POST', `/api/internal/jit/requests/${created.id}/approve`, { reason: 'Escalation confirmed with the CS lead' });
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ approvals: 1, required: 1, request: { state: 'ACTIVE' } });
    expect(await effectivePermissions('pu_csm')).toContain('revenue.invoices.read');
    expect((await call('pu_csm', 'GET', '/probe/invoices')).statusCode).toBe(200);
    expect(notifyStaffMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ platformUserIds: ['pu_csm'], event: 'jit.approved' }));
    expect((await call('pu_approver2', 'POST', `/api/internal/jit/requests/${created.id}/approve`, { reason: 'second approval attempt' })).json()).toMatchObject({ error: 'NOT_PENDING' });
  });

  it('ACC-JIT-3 a ROOT request needs two distinct approvers before it is granted', async () => {
    process.env.DEV_HARDWARE_KEY_ASSERTION = 'hw-assertion';
    const created = (await requestAccess('pu_csm', { permission: 'trust.iam.root', durationMinutes: 30, hardwareKeyAssertion: 'hw-assertion' })).json<{ id: string }>();
    const first = await call('pu_approver', 'POST', `/api/internal/jit/requests/${created.id}/approve`, { reason: 'Incident commander approval' });
    expect(first.json()).toMatchObject({ approvals: 1, required: 2, request: { state: 'PENDING' } });
    expect(await effectivePermissions('pu_csm')).not.toContain('trust.iam.root');
    const second = await call('pu_approver2', 'POST', `/api/internal/jit/requests/${created.id}/approve`, { reason: 'Second security approval' });
    expect(second.json()).toMatchObject({ approvals: 2, required: 2, request: { state: 'ACTIVE' } });
  });

  it('ACC-JIT-4 expiry revokes: after expiresAt the grant is gone from the permissions and the route locks again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T09:00:00.000Z'));
    const created = (await requestAccess()).json<{ id: string }>();
    await call('pu_approver', 'POST', `/api/internal/jit/requests/${created.id}/approve`, { reason: 'Escalation confirmed with the CS lead' });
    expect((await call('pu_csm', 'GET', '/probe/invoices')).statusCode).toBe(200);
    vi.setSystemTime(new Date('2026-10-18T09:31:00.000Z'));
    expect(await effectivePermissions('pu_csm')).not.toContain('revenue.invoices.read');
    expect((await call('pu_csm', 'GET', '/probe/invoices')).statusCode).toBe(403);
    const mine = (await call('pu_csm', 'GET', '/api/internal/jit/sessions/my')).json<{ data: Array<{ state: string }> }>();
    expect(mine.data[0].state).toBe('EXPIRED');
    expect((await call('pu_approver', 'GET', '/api/internal/jit/sessions/active')).json()).toEqual({ data: [] });
  });

  it('ACC-JIT-4 revoking ends the grant immediately; the requester may end their own, others need trust.jit.approve', async () => {
    const created = (await requestAccess()).json<{ id: string }>();
    await call('pu_approver', 'POST', `/api/internal/jit/requests/${created.id}/approve`, { reason: 'Escalation confirmed with the CS lead' });
    expect((await call('pu_approver', 'POST', `/api/internal/jit/sessions/${created.id}/revoke`, { reason: 'x' })).json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const revoked = await call('pu_approver', 'POST', `/api/internal/jit/sessions/${created.id}/revoke`, { reason: 'Escalation closed early' });
    expect(revoked.json()).toMatchObject({ state: 'REVOKED' });
    expect((await call('pu_csm', 'GET', '/probe/invoices')).statusCode).toBe(403);
    expect(notifyStaffMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ platformUserIds: ['pu_csm'], event: 'jit.revoked', body: 'Escalation closed early' }));

    const other = (await requestAccess('pu_approver')).json<{ id: string }>();
    await call('pu_approver2', 'POST', `/api/internal/jit/requests/${other.id}/approve`, { reason: 'Approved for the audit review' });
    expect((await call('pu_csm', 'POST', `/api/internal/jit/sessions/${other.id}/revoke`, { reason: 'not mine to end' })).json()).toMatchObject({ error: 'Forbidden', permission: 'trust.jit.approve' });
    expect((await call('pu_approver', 'POST', `/api/internal/jit/sessions/${other.id}/revoke`, {})).json()).toMatchObject({ state: 'REVOKED' });
  });

  it('ACC-JIT-5 a deny needs a reason and that reason reaches the requester (notification and /jit/sessions/my)', async () => {
    const created = (await requestAccess()).json<{ id: string }>();
    expect((await call('pu_approver', 'POST', `/api/internal/jit/requests/${created.id}/deny`, {})).json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const denied = await call('pu_approver', 'POST', `/api/internal/jit/requests/${created.id}/deny`, { reason: 'Use the read-only finance export instead' });
    expect(denied.json()).toMatchObject({ state: 'DENIED', deniedReason: 'Use the read-only finance export instead' });
    expect(notifyStaffMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ platformUserIds: ['pu_csm'], event: 'jit.denied', body: 'Use the read-only finance export instead' }));
    const mine = (await call('pu_csm', 'GET', '/api/internal/jit/sessions/my')).json<{ data: Array<{ state: string; deniedReason: string }> }>();
    expect(mine.data[0]).toMatchObject({ state: 'DENIED', deniedReason: 'Use the read-only finance export instead' });
    expect((await call('pu_approver', 'POST', `/api/internal/jit/requests/${created.id}/deny`, { reason: 'Use the read-only finance export instead' })).json()).toMatchObject({ error: 'NOT_PENDING' });
  });

  it('the queue and history need trust.jit.approve; /jit/sessions/my only needs trust.jit.request', async () => {
    await requestAccess();
    expect((await call('pu_csm', 'GET', '/api/internal/jit/requests/pending')).statusCode).toBe(403);
    expect((await call('pu_csm', 'GET', '/api/internal/jit/requests')).statusCode).toBe(403);
    const pending = (await call('pu_approver', 'GET', '/api/internal/jit/requests/pending')).json<{ data: Array<{ ownRequest: boolean; requester: { email: string } }> }>();
    expect(pending.data).toEqual([expect.objectContaining({ ownRequest: false, requester: expect.objectContaining({ email: 'csm@fauward.com' }) })]);
    const history = (await call('pu_approver', 'GET', '/api/internal/jit/requests?state=PENDING')).json<{ data: unknown[]; nextCursor: string | null }>();
    expect(history.data).toHaveLength(1);
    expect(history.nextCursor).toBeNull();
    expect((await call('pu_csm', 'GET', '/api/internal/jit/sessions/my')).statusCode).toBe(200);
  });
});
