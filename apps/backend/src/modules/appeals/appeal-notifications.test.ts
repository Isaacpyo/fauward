import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WP-2.2: the appeal round trip notifies people through PlatformNotifier instead of a QUEUED NotificationLog row.
// ACC-NOT-4 tenant files an appeal → staff with trust.safety.read get a StaffNotification (and an email job).
// ACC-NOT-1 staff decide the appeal → every TENANT_ADMIN gets an in-app notification and an email job.

const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>) => ({ id: 'job' })));
vi.mock('../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, scheduledJobsQueue: { add: vi.fn() }, bullmqConnection: {} }));
vi.mock('../../queues/python-services.js', () => ({ publishPythonServiceJob: vi.fn(async () => undefined) }));
vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: 'u_admin', role: 'TENANT_ADMIN', tenantId: 'tenant_a' };
    request.tenant = { id: 'tenant_a', slug: 'northwind', name: 'Northwind', status: 'SUSPENDED' };
  }
}));
vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_safety', email: 'safety@fauward.com', name: 'Sam Safety', status: 'ACTIVE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(['trust.safety.read', 'trust.safety.suspend']), jit: new Map(), permissions: [] })),
  staffPermissionContextForPlatformUser: vi.fn()
}));
vi.mock('../internal/internal-audit.js', () => ({ writeInternalAudit: vi.fn(async () => undefined) }));
const liftSuspensionMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../../services/tenant-suspension.service.js', () => ({
  getActiveSuspension: vi.fn(async () => ({ id: 'sus_1' })),
  liftSuspension: liftSuspensionMock,
  suspendTenant: vi.fn(),
  staffSuspensionActor: () => ({ type: 'STAFF', id: 'pu_safety', label: 'Sam Safety' })
}));

function createPrisma() {
  const appeals: Array<Record<string, unknown>> = [];
  const staffNotifications: Array<Record<string, unknown>> = [];
  const inApp: Array<Record<string, unknown>> = [];
  const activity: Array<Record<string, unknown>> = [];
  const prisma = {
    tenantAppeal: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => appeals.find((row) => row.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `appeal_${appeals.length + 1}`, createdAt: new Date(), ...data };
        appeals.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = appeals.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      })
    },
    suspensionRecord: { findFirst: vi.fn(async () => ({ id: 'sus_1', tenantId: 'tenant_a', status: 'ACTIVE' })) },
    staffUser: { findMany: vi.fn(async () => [{ platformUserId: 'pu_safety' }, { platformUserId: 'pu_lead' }]) },
    staffNotification: { createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => staffNotifications.push(...data)) },
    platformUser: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, email: `${id}@fauward.com` }))) },
    user: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; role: string } }) =>
        where.role === 'TENANT_ADMIN' ? [{ id: 'u_admin', email: 'admin@northwind.test' }, { id: 'u_owner', email: 'owner@northwind.test' }] : []
      )
    },
    inAppNotification: { createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => inApp.push(...data)) },
    platformActivity: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        const row = { id: `act_${activity.length + 1}`, ...create };
        activity.push(row);
        return row;
      })
    }
  };
  return { prisma, appeals, staffNotifications, inApp, activity };
}

let store: ReturnType<typeof createPrisma>;
let app: FastifyInstance;

beforeEach(async () => {
  queueAdd.mockClear();
  liftSuspensionMock.mockClear();
  store = createPrisma();
  app = Fastify();
  app.decorate('prisma', store.prisma as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerAppealRoutes } = await import('./appeals.routes.js');
  const { registerInternalConsolePhaseRoutes } = await import('../internal/console-phases.routes.js');
  await registerAppealRoutes(app);
  await registerInternalConsolePhaseRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const APPEAL_TEXT = 'We were suspended in error; the flagged payments were a single customer re-trying a declined card.';

describe('appeal notifications (D6, WP-2.2)', () => {
  it('ACC-NOT-4 filing an appeal notifies every staff member with trust.safety.read (bell + email) and records activity', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/suspension-appeal', payload: { reason: APPEAL_TEXT, contactEmail: 'admin@northwind.test' } });
    expect(response.statusCode).toBe(201);
    const staffWhere = (store.prisma.staffUser.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(staffWhere).toMatchObject({ roleAssignments: { some: { role: { permissions: { has: 'trust.safety.read' } } } } });
    expect(store.staffNotifications.map((row) => row.platformUserId)).toEqual(['pu_safety', 'pu_lead']);
    expect(store.staffNotifications[0]).toMatchObject({ event: 'appeal.submitted', severity: 'ATTENTION', tenantId: 'tenant_a' });
    const staffEmails = queueAdd.mock.calls.filter(([, data]) => (data as { template?: string }).template === 'staff_notification');
    expect(staffEmails).toHaveLength(2);
    expect(staffEmails[0][1]).toMatchObject({ tenantId: 'system', platformUserId: 'pu_safety', to: 'pu_safety@fauward.com' });
    expect(store.activity).toHaveLength(1);
    expect(store.activity[0]).toMatchObject({ service: 'trust.safety', type: 'appeal.submitted', tenantId: 'tenant_a', dedupeKey: `appeal.submitted:${store.appeals[0].id}` });
  });

  it('ACC-NOT-1 an appeal decision enqueues an email and creates an in-app notification for every TENANT_ADMIN', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/tenants/me/suspension-appeal', payload: { reason: APPEAL_TEXT, contactEmail: 'admin@northwind.test' } });
    queueAdd.mockClear();
    const id = String(store.appeals[0].id);
    const response = await app.inject({ method: 'PATCH', url: `/api/internal/safety/appeals/${id}`, payload: { status: 'APPROVED', reason: 'Payments confirmed legitimate with the card issuer' } });
    expect(response.statusCode).toBe(200);
    expect(liftSuspensionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 'tenant_a', suspensionId: 'sus_1', via: 'APPEAL' }));
    expect(store.inApp.map((row) => row.userId)).toEqual(['u_admin', 'u_owner']);
    expect(store.inApp.every((row) => row.type === 'appeal.decided' && row.tenantId === 'tenant_a')).toBe(true);
    const emails = queueAdd.mock.calls.map(([, data]) => data as { template: string; to: string; tenantId: string; data: Record<string, unknown> });
    expect(emails.map((email) => email.to)).toEqual(['admin@northwind.test', 'owner@northwind.test']);
    expect(emails.every((email) => email.template === 'appeal_decided' && email.tenantId === 'tenant_a' && email.data.decision === 'APPROVED')).toBe(true);
  });
});
