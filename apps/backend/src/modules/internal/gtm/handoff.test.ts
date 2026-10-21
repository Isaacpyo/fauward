import Fastify, { type FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// gtm.handoff (WP-4.17) against real Postgres: a trial → paid conversion (Stripe subscription event) creates exactly one
// SalesHandoff linked to the tenant's won deal; sales fill it in and pass it to CS, a CSM is assigned (and notified),
// accepts, ticks the checklist and completes it; every step is audited and lands on the tenant's activity (C360).

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'sales@fauward.test', name: 'Sales Lead', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_handoff', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));

describe.runIf(HAS_TEST_DB)('gtm.handoff (WP-4.17, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let csmId: string;
  let outsiderId: string;

  async function staffWith(permission: Permission, name: string) {
    const user = await createTestPlatformUser(prisma, { name });
    const role = await prisma.staffRole.create({ data: { id: `test-handoff-${uniqueSuffix()}`, name: `${name} role`, description: 'test', permissions: [permission] } });
    const staff = await prisma.staffUser.create({ data: { platformUserId: user.id, email: user.email, name } });
    await prisma.staffRoleAssignment.create({ data: { staffId: staff.id, roleId: role.id } });
    return user.id;
  }

  async function trialTenant(status: 'TRIALING' | 'DEMO' = 'TRIALING') {
    const tenant = await createTestTenant(prisma, { status });
    await prisma.subscription.create({ data: { tenantId: tenant.id, plan: 'STARTER', status: 'TRIALING', stripeSubscriptionId: `sub_${uniqueSuffix()}` } });
    return tenant;
  }

  function stripeEvent(tenantId: string, status: Stripe.Subscription.Status, id = `evt_${uniqueSuffix()}`) {
    return {
      id,
      type: 'customer.subscription.updated',
      data: { object: { id: `sub_${uniqueSuffix()}`, status, customer: `cus_${uniqueSuffix()}`, metadata: { tenantId }, items: { data: [] }, cancel_at_period_end: false, trial_end: null, canceled_at: null } }
    } as unknown as Stripe.Event;
  }

  async function convert(tenantId: string, id?: string) {
    const { handleStripeSubscriptionEvent } = await import('../../../services/subscription.service.js');
    return handleStripeSubscriptionEvent(app, stripeEvent(tenantId, 'active', id));
  }

  const patch = (id: string, payload: Record<string, unknown>) => app.inject({ method: 'PATCH', url: `/api/internal/handoff/${id}`, payload });

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    csmId = await staffWith('customer.success.write', 'Casey CSM');
    outsiderId = await staffWith('trust.audit.read', 'Avery Auditor');
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleHandoffRoutes } = await import('./handoff.routes.js');
    await registerConsoleHandoffRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    permissions.current = ['gtm.handoff.read', 'gtm.handoff.write'];
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-HO-1 a trial → paid conversion creates exactly one handoff, linked to the won deal', async () => {
    const tenant = await trialTenant();
    const deal = await prisma.salesDeal.create({ data: { name: `${tenant.name} expansion`, stage: 'WON', amount: '1200.00', tenantId: tenant.id, ownerEmail: 'ae@fauward.test' } });

    const eventId = `evt_${uniqueSuffix()}`;
    expect(await convert(tenant.id, eventId)).toEqual({ status: 'UPDATED' });
    expect(await convert(tenant.id, eventId)).toEqual({ status: 'DUPLICATE' });
    const handoffs = await prisma.salesHandoff.findMany({ where: { tenantId: tenant.id } });
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0]).toMatchObject({ status: 'PENDING_SALES', dealId: deal.id });
    const statusEvent = await prisma.subscriptionEvent.findUniqueOrThrow({ where: { stripeEventId: eventId } });
    expect(handoffs[0].subscriptionEventId).toBe(statusEvent.id);

    // A later lapse and re-activation is not a new conversion handoff.
    const { handleStripeSubscriptionEvent } = await import('../../../services/subscription.service.js');
    await handleStripeSubscriptionEvent(app, stripeEvent(tenant.id, 'past_due'));
    await handleStripeSubscriptionEvent(app, stripeEvent(tenant.id, 'active'));
    expect(await prisma.salesHandoff.count({ where: { tenantId: tenant.id } })).toBe(1);

    // A trial that stays a trial, and a demo tenant, create nothing.
    const stillTrial = await trialTenant();
    await handleStripeSubscriptionEvent(app, stripeEvent(stillTrial.id, 'trialing'));
    expect(await prisma.salesHandoff.count({ where: { tenantId: stillTrial.id } })).toBe(0);
    const demo = await trialTenant('DEMO');
    await convert(demo.id);
    expect(await prisma.salesHandoff.count({ where: { tenantId: demo.id } })).toBe(0);

    const queue = (await app.inject({ method: 'GET', url: '/api/internal/handoff/queue?stage=SALES' })).json();
    const row = queue.data.find((item: { tenant: { id: string } }) => item.tenant.id === tenant.id);
    expect(row).toMatchObject({ status: 'PENDING_SALES', deal: { id: deal.id, amount: '1200.00' }, checklistDone: 0, checklistTotal: 4 });
    const won = (await app.inject({ method: 'GET', url: '/api/internal/handoff/won?days=30' })).json();
    expect(won.data.some((item: { id: string }) => item.id === handoffs[0].id)).toBe(true);
    expect(await prisma.platformActivity.count({ where: { tenantId: tenant.id, type: 'handoff.created' } })).toBe(1);
  });

  it('ACC-HO-2 pass to CS, assign, accept and complete are audited and show on the tenant activity (C360)', async () => {
    const tenant = await trialTenant();
    await convert(tenant.id);
    const handoff = await prisma.salesHandoff.findFirstOrThrow({ where: { tenantId: tenant.id } });

    expect((await patch(handoff.id, { status: 'PENDING_CS' })).json()).toMatchObject({ error: 'FIELDS_REQUIRED' });
    expect((await patch(handoff.id, { checklist: [{ key: 'kickoff_booked', done: true }] })).json()).toMatchObject({ error: 'CHECKLIST_LOCKED' });
    const filled = await patch(handoff.id, { fields: { stakeholders: 'Dana (Ops lead)', successCriteria: '500 shipments a month through the portal' } });
    expect(filled.statusCode).toBe(200);
    expect((await patch(handoff.id, { status: 'COMPLETED' })).json()).toMatchObject({ error: 'INVALID_TRANSITION' });
    expect((await patch(handoff.id, { status: 'PENDING_CS' })).json()).toMatchObject({ status: 'PENDING_CS' });

    expect((await patch(handoff.id, { status: 'ACCEPTED' })).json()).toMatchObject({ error: 'CSM_REQUIRED' });
    expect((await patch(handoff.id, { assignCsmId: csmId })).json()).toMatchObject({ csm: { id: csmId } });
    expect((await patch(handoff.id, { status: 'ACCEPTED' })).json()).toMatchObject({ status: 'ACCEPTED' });
    expect((await patch(handoff.id, { fields: { risks: 'Late edit' } })).json()).toMatchObject({ error: 'FIELDS_LOCKED' });
    expect((await patch(handoff.id, { status: 'COMPLETED' })).json()).toMatchObject({ error: 'CHECKLIST_OPEN' });

    const ticked = await patch(handoff.id, { checklist: ['kickoff_booked', 'admins_confirmed', 'integrations_reviewed', 'success_plan_shared'].map((key) => ({ key, done: true })) });
    expect(ticked.json()).toMatchObject({ checklistDone: 4 });
    expect(ticked.json().document.checklist[0]).toMatchObject({ done: true, doneBy: permissions.userId });
    const done = await patch(handoff.id, { status: 'COMPLETED' });
    expect(done.json()).toMatchObject({ status: 'COMPLETED' });
    expect((await patch(handoff.id, { assignCsmId: null })).json()).toMatchObject({ error: 'HANDOFF_COMPLETED' });

    const row = await prisma.salesHandoff.findUniqueOrThrow({ where: { id: handoff.id } });
    expect(row).toMatchObject({ assignedCsmId: csmId, assignedBy: permissions.userId, completedBy: permissions.userId });
    expect(row.acceptedAt).toBeInstanceOf(Date);

    const audit = await prisma.platformAuditLog.findMany({ where: { targetTenantId: tenant.id, action: { startsWith: 'HANDOFF_' } }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((entry) => entry.action)).toEqual(['HANDOFF_UPDATED', 'HANDOFF_PENDING_CS', 'HANDOFF_ASSIGNED', 'HANDOFF_ACCEPTED', 'HANDOFF_UPDATED', 'HANDOFF_COMPLETED']);
    const activity = await prisma.platformActivity.findMany({ where: { tenantId: tenant.id, service: 'gtm.handoff' }, select: { type: true } });
    expect(activity.map((entry) => entry.type)).toEqual(expect.arrayContaining(['handoff.created', 'handoff.pending_cs', 'handoff.assigned', 'handoff.accepted', 'handoff.completed']));

    permissions.current = ['gtm.handoff.read'];
    expect((await patch(handoff.id, { status: 'PENDING_CS' })).statusCode).toBe(403);
  });

  it('ACC-HO-3 the assigned CSM gets a staff notification; only customer-success staff can be assigned', async () => {
    const tenant = await trialTenant();
    await convert(tenant.id);
    const handoff = await prisma.salesHandoff.findFirstOrThrow({ where: { tenantId: tenant.id } });

    const assignees = (await app.inject({ method: 'GET', url: '/api/internal/handoff/assignees' })).json();
    expect(assignees.data.map((user: { id: string }) => user.id)).toContain(csmId);
    expect(assignees.data.map((user: { id: string }) => user.id)).not.toContain(outsiderId);

    expect((await patch(handoff.id, { assignCsmId: outsiderId })).json()).toMatchObject({ error: 'NOT_A_CSM' });
    expect((await patch(handoff.id, { assignCsmId: csmId })).statusCode).toBe(200);
    const notes = await prisma.staffNotification.findMany({ where: { platformUserId: csmId, event: 'handoff.assigned', tenantId: tenant.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].link).toBe(`/gtm/handoff/${handoff.id}`);

    // Re-saving the same assignee does not notify twice.
    await patch(handoff.id, { assignCsmId: csmId });
    expect(await prisma.staffNotification.count({ where: { platformUserId: csmId, event: 'handoff.assigned', tenantId: tenant.id } })).toBe(1);
  });
});
