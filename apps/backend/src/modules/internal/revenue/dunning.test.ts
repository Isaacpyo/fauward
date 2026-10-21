import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis, uniqueSuffix } from '../../../test-support/test-db.js';

// revenue.dunning (WP-4.5) against real Postgres: a failed invoice enrols on the default sequence, each due step runs
// exactly once, the SUSPEND step is the only billing suspension, invoice.paid recovers and lifts, retry uses Stripe
// invoices.pay with an idempotency key (or the "update card" email without Stripe), and the sequence editor keeps
// exactly one default.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));
const mail = vi.hoisted(() => ({ sent: [] as Array<{ tenantId: string; template: string }> }));
const stripe = vi.hoisted(() => ({ configured: false, payInvoice: vi.fn(async () => ({ status: 'paid' })) }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'dunning@fauward.test', name: 'Dunning Owner', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_dunning', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
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
vi.mock('../../../services/vendors/stripe.adapter.js', () => ({
  stripeAdapter: {
    vendor: 'stripe',
    isConfigured: () => stripe.configured,
    missingEnv: () => (stripe.configured ? [] : ['STRIPE_SECRET_KEY']),
    payInvoice: stripe.payInvoice
  }
}));

const DAY = 86_400_000;

describe.runIf(HAS_TEST_DB)('revenue.dunning (WP-4.5, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['revenue.dunning.read', 'revenue.dunning.write'];
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleDunningRoutes } = await import('./dunning.routes.js');
    await registerConsoleDunningRoutes(app);
    await app.ready();
    // Earlier runs may have left another sequence as the default; the tests below assume the standard one.
    const { ensureDefaultSequence, DEFAULT_SEQUENCE_ID } = await import('../../../services/dunning.service.js');
    const current = await ensureDefaultSequence(app);
    if (current.id !== DEFAULT_SEQUENCE_ID && (await prisma.dunningSequence.findUnique({ where: { id: DEFAULT_SEQUENCE_ID } }))) {
      await prisma.$transaction([prisma.dunningSequence.updateMany({ where: { isDefault: true }, data: { isDefault: false } }), prisma.dunningSequence.update({ where: { id: DEFAULT_SEQUENCE_ID }, data: { isDefault: true, active: true } })]);
    }
  });

  beforeEach(() => {
    mail.sent = [];
    stripe.configured = false;
    stripe.payInvoice.mockClear();
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

  async function stepEvents(enrollmentId: string) {
    return prisma.dunningEvent.findMany({ where: { eventType: 'step_executed', metadata: { path: ['enrollmentId'], equals: enrollmentId } }, orderBy: { createdAt: 'asc' } });
  }

  it('ACC-DUN-1 invoice.payment_failed enrols the invoice on the default sequence and runs day 0 once', async () => {
    const { handleDunningEvent } = await import('../../payments/billing.service.js');
    const tenant = await tenantWithAdmin();
    const invoiceRef = `in_${uniqueSuffix()}`;

    const first = await handleDunningEvent(app, { tenantId: tenant.id, attempt: 1, invoiceRef });
    await handleDunningEvent(app, { tenantId: tenant.id, attempt: 1, invoiceRef }); // redelivered webhook
    await handleDunningEvent(app, { tenantId: tenant.id, attempt: 2, invoiceRef }); // Stripe's next attempt

    const enrollments = await prisma.dunningEnrollment.findMany({ where: { tenantId: tenant.id } });
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]).toMatchObject({ id: first.enrollmentId, invoiceId: invoiceRef, source: 'STRIPE', sequenceId: 'dunning-default', currentStep: 1, status: 'ACTIVE' });
    expect(mail.sent).toEqual([{ tenantId: tenant.id, template: 'billing_payment_failed' }]);
    expect((await stepEvents(first.enrollmentId)).map((row) => (row.metadata as { outcome: string }).outcome)).toEqual(['DONE']);
    // ACC-SUS-2 (WP-4.5): a second failed attempt alone no longer suspends.
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).status).toBe('ACTIVE');
    expect(await prisma.platformAuditLog.count({ where: { action: 'DUNNING_ENROLLED', targetTenantId: tenant.id } })).toBe(1);
  });

  it('ACC-DUN-2 each due step runs exactly once, also when the job runs twice or concurrently', async () => {
    const { advanceEnrollment, enrollInvoice } = await import('../../../services/dunning.service.js');
    const tenant = await tenantWithAdmin();
    const { enrollment } = await enrollInvoice(app, { tenantId: tenant.id, invoiceId: `in_${uniqueSuffix()}`, source: 'STRIPE', trigger: 'test' });
    const day = (n: number) => new Date(enrollment.createdAt.getTime() + n * DAY + 60_000);

    expect(await advanceEnrollment(app, enrollment.id, day(0))).toBe(1);
    expect(await advanceEnrollment(app, enrollment.id, day(0))).toBe(0);
    expect(await advanceEnrollment(app, enrollment.id, day(2))).toBe(0);
    const concurrent = await Promise.all([advanceEnrollment(app, enrollment.id, day(3)), advanceEnrollment(app, enrollment.id, day(3)), advanceEnrollment(app, enrollment.id, day(3))]);
    expect(concurrent.reduce((sum, value) => sum + value, 0)).toBe(1);
    // Day 7 is email + in-app.
    expect(await advanceEnrollment(app, enrollment.id, day(8))).toBe(1);
    const events = await stepEvents(enrollment.id);
    expect(events.map((row) => (row.metadata as { dayOffset: number }).dayOffset)).toEqual([0, 3, 7]);
    expect(mail.sent.map((item) => item.template)).toEqual(['billing_payment_failed', 'billing_payment_failed', 'billing_final_warning']);
    expect(await prisma.inAppNotification.count({ where: { tenantId: tenant.id, type: 'billing.payment_failed' } })).toBe(1);
    expect((await prisma.dunningEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).nextActionAt.getTime()).toBe(enrollment.createdAt.getTime() + 14 * DAY);
  });

  it('ACC-DUN-3 the SUSPEND step suspends via D3 (DUNNING); invoice.paid recovers the enrolment and lifts it', async () => {
    const { advanceEnrollment } = await import('../../../services/dunning.service.js');
    const { handleDunningEvent, handleDunningPaid } = await import('../../payments/billing.service.js');
    const tenant = await tenantWithAdmin();
    const invoiceRef = `in_${uniqueSuffix()}`;
    const { enrollmentId } = await handleDunningEvent(app, { tenantId: tenant.id, attempt: 1, invoiceRef });
    const enrollment = await prisma.dunningEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } });

    expect(await advanceEnrollment(app, enrollmentId, new Date(enrollment.createdAt.getTime() + 15 * DAY))).toBe(3);
    const suspended = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(suspended.status).toBe('SUSPENDED');
    expect(await prisma.suspensionRecord.findFirst({ where: { tenantId: tenant.id, status: 'ACTIVE' } })).toMatchObject({ source: 'DUNNING', category: 'BILLING', sourceRef: invoiceRef });
    expect(await prisma.dunningEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).toMatchObject({ status: 'EXHAUSTED', currentStep: 4 });

    await handleDunningPaid(app, { tenantId: tenant.id, invoiceRef });
    expect(await prisma.dunningEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).toMatchObject({ status: 'RECOVERED' });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).status).toBe('ACTIVE');
    expect(await prisma.suspensionRecord.findFirst({ where: { tenantId: tenant.id, sourceRef: invoiceRef } })).toMatchObject({ status: 'LIFTED', liftedVia: 'PAYMENT' });

    const timeline = (await app.inject({ method: 'GET', url: `/api/internal/dunning/tenants/${tenant.id}/timeline` })).json();
    expect(timeline.enrollments[0]).toMatchObject({ status: 'RECOVERED', stepsDone: 4, stepsTotal: 4 });
    expect(timeline.events.map((row: { eventType: string }) => row.eventType)).toEqual(expect.arrayContaining(['enrolled', 'step_executed', 'recovered', 'payment_failed', 'payment_succeeded']));
 
  }, 60_000);

  it('ACC-DUN-4 retry calls Stripe invoices.pay with an idempotency key; without Stripe it sends the update-card email', async () => {
    const { enrollInvoice } = await import('../../../services/dunning.service.js');
    const tenant = await tenantWithAdmin();
    const invoiceRef = `in_${uniqueSuffix()}`;
    const { enrollment } = await enrollInvoice(app, { tenantId: tenant.id, invoiceId: invoiceRef, source: 'STRIPE', trigger: 'test' });

    stripe.configured = true;
    const noReason = await app.inject({ method: 'POST', url: `/api/internal/dunning/enrollments/${enrollment.id}/retry`, payload: {} });
    expect(noReason.json()).toMatchObject({ error: 'REASON_REQUIRED' });
    const retried = await app.inject({ method: 'POST', url: `/api/internal/dunning/enrollments/${enrollment.id}/retry`, headers: { 'idempotency-key': 'key-123' }, payload: { reason: 'Customer updated their card' } });
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toMatchObject({ channel: 'stripe', idempotencyKey: 'dunning-retry:key-123' });
    expect(stripe.payInvoice).toHaveBeenCalledWith(invoiceRef, 'dunning-retry:key-123');

    stripe.configured = false;
    const emailed = await app.inject({ method: 'POST', url: `/api/internal/dunning/enrollments/${enrollment.id}/retry`, payload: { reason: 'Ask them to update the card' } });
    expect(emailed.json()).toMatchObject({ channel: 'email', emails: 1 });
    expect(mail.sent).toEqual([{ tenantId: tenant.id, template: 'billing_payment_failed' }]);
    expect(await prisma.platformAuditLog.count({ where: { action: 'DUNNING_RETRY', targetTenantId: tenant.id } })).toBe(2);
  });

  it('vendor-free: an overdue PLATFORM invoice is enrolled by the job; pause stops steps; a recorded payment recovers it', async () => {
    const { runDunningAdvance, advanceEnrollment } = await import('../../../services/dunning.service.js');
    const tenant = await tenantWithAdmin();
    const invoice = await prisma.invoice.create({ data: { tenantId: tenant.id, kind: 'PLATFORM', invoiceNumber: `FW-${uniqueSuffix()}`, lineItems: [], subtotal: '49.00', total: '49.00', currency: 'GBP', status: 'OVERDUE', dueDate: new Date(Date.now() - 5 * DAY) } });
    await runDunningAdvance(app);
    const enrollment = await prisma.dunningEnrollment.findUniqueOrThrow({ where: { invoiceId: invoice.id } });
    expect(enrollment).toMatchObject({ source: 'PLATFORM', currentStep: 1 });
    expect(mail.sent).toContainEqual({ tenantId: tenant.id, template: 'billing_payment_failed' });

    const paused = await app.inject({ method: 'POST', url: `/api/internal/dunning/enrollments/${enrollment.id}/pause`, payload: { reason: 'Customer promised payment' } });
    expect(paused.json()).toMatchObject({ status: 'PAUSED' });
    expect(await advanceEnrollment(app, enrollment.id, new Date(Date.now() + 20 * DAY))).toBe(0);
    expect((await app.inject({ method: 'POST', url: `/api/internal/dunning/enrollments/${enrollment.id}/pause`, payload: { reason: 'Customer promised payment' } })).statusCode).toBe(409);

    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID', paidAt: new Date() } });
    await runDunningAdvance(app);
    expect(await prisma.dunningEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).toMatchObject({ status: 'RECOVERED' });

    const overview = (await app.inject({ method: 'GET', url: '/api/internal/dunning/overview' })).json();
    expect(Array.isArray(overview.failedPayments) && Array.isArray(overview.overdueInvoices) && Array.isArray(overview.enrollments)).toBe(true);
    expect(overview.stripe).toMatchObject({ configured: false });
  });

  it('the sequence editor keeps exactly one default and guards running sequences', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/internal/dunning/sequences', payload: { name: `Gentle ${uniqueSuffix()}` } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    const withStep = await app.inject({ method: 'POST', url: `/api/internal/dunning/sequences/${id}/steps`, payload: { dayOffset: 0, action: 'EMAIL' } });
    expect(withStep.json().steps).toEqual([expect.objectContaining({ dayOffset: 0, action: 'EMAIL', template: 'billing_payment_failed' })]);
    const badTemplate = await app.inject({ method: 'POST', url: `/api/internal/dunning/sequences/${id}/steps`, payload: { dayOffset: 2, action: 'EMAIL', template: 'not_a_template' } });
    expect(badTemplate.json()).toMatchObject({ error: 'UNKNOWN_TEMPLATE' });

    const promoted = await app.inject({ method: 'PATCH', url: `/api/internal/dunning/sequences/${id}`, payload: { isDefault: true } });
    expect(promoted.json()).toMatchObject({ isDefault: true });
    expect(await prisma.dunningSequence.count({ where: { isDefault: true } })).toBe(1);
    const demote = await app.inject({ method: 'PATCH', url: `/api/internal/dunning/sequences/${id}`, payload: { isDefault: false } });
    expect(demote.json()).toMatchObject({ error: 'DEFAULT_REQUIRED' });
    // Put the standard sequence back as the default.
    await app.inject({ method: 'PATCH', url: '/api/internal/dunning/sequences/dunning-default', payload: { isDefault: true } });
    expect((await prisma.dunningSequence.findFirstOrThrow({ where: { isDefault: true } })).id).toBe('dunning-default');

    const removed = await app.inject({ method: 'DELETE', url: `/api/internal/dunning/sequences/${id}` });
    expect(removed.statusCode).toBe(200);
    // The default sequence has running enrolments from the tests above: its timing cannot change underneath them.
    const step = (await app.inject({ method: 'GET', url: '/api/internal/dunning/sequences/dunning-default' })).json().steps[0];
    const retimed = await app.inject({ method: 'PATCH', url: `/api/internal/dunning/sequences/dunning-default/steps/${step.id}`, payload: { dayOffset: 1 } });
    expect(retimed.json()).toMatchObject({ error: 'SEQUENCE_IN_USE' });
    permissions.current = ['revenue.dunning.read'];
    expect((await app.inject({ method: 'POST', url: '/api/internal/dunning/sequences', payload: { name: 'Nope' } })).statusCode).toBe(403);
    permissions.current = ['revenue.dunning.read', 'revenue.dunning.write'];
  });
});
