import Fastify, { type FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// revenue.subscriptions + save offers (WP-2.7, L6) over an in-memory store with the real plan-change, subscription,
// save-offer and MRR services; the Stripe webhook route verifies real signatures (Stripe's test header helper).

type Row = Record<string, unknown> & { id: string };
const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>) => ({ id: 'job' })));
const tenantUser = vi.hoisted(() => ({ role: 'TENANT_ADMIN' }));
const suspension = vi.hoisted(() => ({
  suspendTenant: vi.fn(async (_app: unknown, input: { tenantId: string }) => ({ record: { id: 'sus_1' }, tenant: { id: input.tenantId, status: 'SUSPENDED' }, becameSuspended: true, duplicate: false })),
  liftDunningSuspensionForInvoice: vi.fn(async () => ({ lifted: ['sus_1'] })),
  getActiveSuspensions: vi.fn(async () => [])
}));

// WP-4.5: Stripe failures enrol the invoice in dunning; the sequence itself is tested on real Postgres (dunning.test.ts).
const dunning = vi.hoisted(() => ({
  enrollInvoice: vi.fn(async (_app: unknown, input: { invoiceId: string }) => ({ enrollment: { id: `enr_${input.invoiceId}` }, created: true })),
  advanceEnrollment: vi.fn(async () => 1),
  recoverEnrollment: vi.fn(async () => 1)
}));
vi.mock('../../../services/dunning.service.js', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...dunning }));
vi.mock('../../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, scheduledJobsQueue: { add: queueAdd }, analyticsQueue: {}, outboxQueue: {}, webhookQueue: {}, bullmqConnection: {} }));
vi.mock('../../notifications/notifications.worker.js', () => ({ dlqNotificationQueue: {} }));
vi.mock('../../../services/tenant-suspension.service.js', () => suspension);
vi.mock('../internal-audit.js', () => ({ writeInternalAudit: vi.fn(async () => undefined) }));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: ['ROOT'], rolePermissions: new Set(['revenue.subscriptions.read', 'revenue.subscriptions.write', 'revenue.subscriptions.override', 'revenue.dunning.read', 'revenue.dunning.write']), jit: new Map(), permissions: [] })),
  staffPermissionContextForPlatformUser: vi.fn(async () => ({ staff: null, roles: ['ROOT'], permissions: [] }))
}));
vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_rev', email: 'rita@fauward.com', name: 'Rita Revenue', role: 'PLATFORM_SUPPORT', status: 'ACTIVE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: 'u_admin', role: tenantUser.role, tenantId: 'tenant_a', email: 'admin@northwind.test' };
    request.tenant = { id: 'tenant_a', name: 'Northwind', slug: 'northwind', status: 'ACTIVE' };
  }
}));

function compare(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
  if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
    const ops = condition as Record<string, unknown>;
    if ('path' in ops) return (value as Record<string, unknown> | null)?.[(ops.path as string[])[0]] === ops.equals;
    if ('in' in ops) return (ops.in as unknown[]).includes(value);
    if ('not' in ops) return ops.not === null ? value !== null && value !== undefined : value !== ops.not;
    if ('gt' in ops) return value instanceof Date && value > (ops.gt as Date);
    if ('lte' in ops) return value instanceof Date && value <= (ops.lte as Date);
    return true;
  }
  return value === condition;
}

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Record<string, unknown>[]).some((part) => matches(row, part));
    return compare(row[key], condition);
  });
}

type Relate = (row: Row, args: { include?: Record<string, unknown>; select?: Record<string, unknown> }) => Row;

function table(rows: Row[], prefix: string, defaults: Record<string, unknown> = {}, relate: Relate = (row) => row) {
  let seq = 0;
  const out = (row: Row | undefined, args: { include?: Record<string, unknown>; select?: Record<string, unknown> } = {}) => (row ? relate({ ...row }, args) : null);
  const sorted = () => [...rows].sort((a, b) => ((b.createdAt as Date)?.getTime() ?? 0) - ((a.createdAt as Date)?.getTime() ?? 0));
  return {
    create: vi.fn(async ({ data }: { data: Omit<Row, 'id'> & { id?: string } }) => {
      seq += 1;
      const row: Row = { createdAt: new Date(Date.now() + seq), updatedAt: new Date(), ...defaults, ...data, id: data.id ?? `${prefix}_${seq}` };
      rows.push(row);
      return { ...row };
    }),
    findUnique: vi.fn(async (args: { where: Record<string, unknown>; include?: Record<string, unknown>; select?: Record<string, unknown> }) => out(rows.find((row) => matches(row, args.where)), args)),
    findFirst: vi.fn(async (args: { where?: Record<string, unknown>; include?: Record<string, unknown> } = {}) => out(sorted().find((row) => matches(row, args.where ?? {})), args)),
    findFirstOrThrow: vi.fn(async (args: { where: Record<string, unknown>; include?: Record<string, unknown> }) => out(rows.find((row) => matches(row, args.where)), args)!),
    findMany: vi.fn(async (args: { where?: Record<string, unknown>; include?: Record<string, unknown>; take?: number } = {}) => sorted().filter((row) => matches(row, args.where ?? {})).slice(0, args.take ?? 1000).map((row) => out(row, args)!)),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => Object.assign(rows.find((row) => matches(row, where))!, data, { updatedAt: new Date() })),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hits = rows.filter((row) => matches(row, where));
      hits.forEach((row) => Object.assign(row, data));
      return { count: hits.length };
    }),
    upsert: vi.fn(async ({ where, update, create }: { where: Record<string, unknown>; update: Row; create: Row }) => {
      const existing = rows.find((row) => matches(row, where));
      if (existing) return Object.assign(existing, update);
      seq += 1;
      const row = { createdAt: new Date(), updatedAt: new Date(), ...defaults, ...create, id: `${prefix}_${seq}` };
      rows.push(row);
      return row;
    })
  };
}

function createStore() {
  const tenants: Row[] = [
    { id: 'tenant_a', name: 'Northwind', slug: 'northwind', status: 'ACTIVE', plan: 'STARTER', createdAt: new Date('2026-01-01') },
    { id: 'tenant_b', name: 'Southwind', slug: 'southwind', status: 'ACTIVE', plan: 'PRO', createdAt: new Date('2026-01-02') }
  ];
  const subscriptions: Row[] = [
    { id: 'sub_a', tenantId: 'tenant_a', plan: 'STARTER', billingCycle: 'MONTHLY', status: 'ACTIVE', stripeSubscriptionId: null, stripeCustomerId: null, cancelAtPeriodEnd: false, currentPeriodStart: null, currentPeriodEnd: null, trialEnd: null, cancelledAt: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
    { id: 'sub_b', tenantId: 'tenant_b', plan: 'PRO', billingCycle: 'MONTHLY', status: 'ACTIVE', stripeSubscriptionId: 'sub_stripe_b', stripeCustomerId: 'cus_b', cancelAtPeriodEnd: false, currentPeriodStart: null, currentPeriodEnd: null, trialEnd: null, cancelledAt: null, createdAt: new Date('2026-01-02'), updatedAt: new Date('2026-01-02') }
  ];
  const data = {
    tenants,
    subscriptions,
    requests: [] as Row[],
    events: [] as Row[],
    overrides: [] as Row[],
    contracts: [] as Row[],
    activity: [] as Row[],
    inApp: [] as Row[],
    staffNotifications: [] as Row[],
    dunning: [] as Row[],
    offers: [] as Row[],
    invoices: [] as Row[],
    credits: [] as Row[],
    audit: [] as Row[]
  };
  const subFor = (tenantId: unknown) => subscriptions.find((row) => row.tenantId === tenantId) ?? null;
  const tenantWith = (id: unknown, withSub: boolean) => {
    const tenant = tenants.find((row) => row.id === id);
    return tenant ? { ...tenant, ...(withSub ? { subscription: subFor(id) } : {}) } : null;
  };
  const prisma: Record<string, unknown> = {
    tenant: table(tenants, 'tenant', {}, (row, args) => ((args.include?.subscription || args.select?.subscription) ? { ...row, subscription: subFor(row.id) } : row)),
    subscription: table(subscriptions, 'sub', {}, (row, args) => (args.include?.tenant ? { ...row, tenant: tenantWith(row.tenantId, false) } : row)),
    planChangeRequest: table(data.requests, 'pcr', { stripeCheckoutSessionId: null, decisionReason: null, decidedByPlatformUserId: null, decidedAt: null, appliedAt: null }, (row, args) => (args.include?.tenant ? { ...row, tenant: tenantWith(row.tenantId, true) } : row)),
    subscriptionEvent: table(data.events, 'sev'),
    pricingOverride: table(data.overrides, 'po'),
    customContract: table(data.contracts, 'cc'),
    currencyRate: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    dunningEvent: table(data.dunning, 'de'),
    saveOffer: table(data.offers, 'so', { code: null, redeemedAt: null, stripeCouponId: null, redeemedCreditNoteId: null, approvedBy: null }),
    invoice: table(data.invoices, 'inv', {}, (row, args) => (args.include ? { ...row, payments: [], creditNotes: data.credits.filter((credit) => credit.invoiceId === row.id) } : row)),
    creditNote: table(data.credits, 'cn'),
    platformAuditLog: table(data.audit, 'pal'),
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Row }) => {
        const existing = data.activity.find((row) => row.dedupeKey === where.dedupeKey);
        if (existing) return existing;
        const row = { ...create, id: `act_${data.activity.length + 1}` };
        data.activity.push(row);
        return row;
      })
    },
    user: { findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) => (where.tenantId === 'tenant_a' ? [{ id: 'u_admin', email: 'admin@northwind.test' }] : [])) },
    inAppNotification: { createMany: vi.fn(async ({ data: rows }: { data: Row[] }) => data.inApp.push(...rows)) },
    staffUser: { findMany: vi.fn(async () => [{ platformUserId: 'pu_rev' }]) },
    staffNotification: { createMany: vi.fn(async ({ data: rows }: { data: Row[] }) => data.staffNotifications.push(...rows)) },
    platformUser: { findMany: vi.fn(async () => []) }
  };
  prisma.$transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma));
  return { prisma, ...data };
}

let db: ReturnType<typeof createStore>;
let app: FastifyInstance;
const redis = { publish: vi.fn(async () => 1), del: vi.fn(async () => 1), get: vi.fn(async () => null), set: vi.fn(async () => 'OK') };
const REASON = 'Confirmed with the account owner by phone';

beforeEach(async () => {
  queueAdd.mockClear();
  Object.values(dunning).forEach((spy) => spy.mockClear());
  suspension.suspendTenant.mockClear();
  suspension.liftDunningSuspensionForInvoice.mockClear();
  redis.publish.mockClear();
  redis.del.mockClear();
  tenantUser.role = 'TENANT_ADMIN';
  db = createStore();
  app = Fastify();
  app.decorate('prisma', db.prisma as never);
  app.decorate('redis', redis as never);
  const { registerConsoleSubscriptionRoutes } = await import('./subscriptions.routes.js');
  const { registerPlanChangeRoutes } = await import('../../tenants/plan-change.routes.js');
  const { registerPaymentsRoutes } = await import('../../payments/payments.routes.js');
  const { registerConsoleDunningRoutes } = await import('./dunning.routes.js');
  await registerConsoleSubscriptionRoutes(app);
  await registerConsoleDunningRoutes(app);
  await registerPlanChangeRoutes(app);
  await registerPaymentsRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  const { config } = await import('../../../config/index.js');
  config.stripe.secretKey = undefined;
  config.stripe.webhookSecret = undefined;
  config.stripe.prices.PRO.MONTHLY = undefined;
});

async function enableStripe() {
  const { config } = await import('../../../config/index.js');
  config.stripe.secretKey = 'sk_test_fauward_unit';
  config.stripe.webhookSecret = 'whsec_fauward_unit';
  config.stripe.prices.PRO.MONTHLY = 'price_pro_monthly';
}

async function signedWebhook(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const header = new Stripe('sk_test_fauward_unit').webhooks.generateTestHeaderString({ payload, secret: 'whsec_fauward_unit' });
  return app.inject({ method: 'POST', url: '/api/v1/payments/webhook/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': header }, payload });
}

describe('revenue.subscriptions (WP-2.7, L6)', () => {
  it('ACC-SUB-1 ACC-L6-1 no Stripe: request → approve → plan, entitlements and event change; the tenant is told', async () => {
    const options = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/plan-change' });
    expect(options.json()).toMatchObject({ currentPlan: 'STARTER', request: null });
    expect(options.json().plans.find((plan: { plan: string }) => plan.plan === 'PRO')).toMatchObject({ price: { currency: 'GBP', monthly: '79.00' }, selfServe: false });

    const requested = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/plan-change', payload: { plan: 'pro', billingCycle: 'monthly' } });
    expect(requested.statusCode).toBe(201);
    expect(requested.json()).toMatchObject({ kind: 'REQUESTED', request: { status: 'PENDING', channel: 'MANUAL_APPROVAL', fromPlan: 'STARTER', toPlan: 'PRO' } });
    expect(db.staffNotifications).toEqual([expect.objectContaining({ platformUserId: 'pu_rev', event: 'plan.change_requested' })]);

    const queue = await app.inject({ method: 'GET', url: '/api/internal/subscriptions/plan-change-requests?status=PENDING' });
    const requestId = queue.json().data[0].id as string;
    expect(queue.json().data[0]).toMatchObject({ tenant: { name: 'Northwind' }, toPlan: 'PRO' });

    const decided = await app.inject({ method: 'POST', url: `/api/internal/subscriptions/plan-change-requests/${requestId}/decision`, payload: { decision: 'APPROVE', reason: REASON } });
    expect(decided.statusCode).toBe(200);
    expect(decided.json().request).toMatchObject({ status: 'APPLIED' });
    expect(db.tenants[0].plan).toBe('PRO');
    expect(db.subscriptions[0].plan).toBe('PRO');
    expect(db.events).toEqual([expect.objectContaining({ tenantId: 'tenant_a', type: 'PLAN_CHANGED', fromPlan: 'STARTER', toPlan: 'PRO', source: 'CONSOLE', planChangeRequestId: requestId })]);
    expect(String(db.events[0].mrrBefore)).toBe('29');
    expect(String(db.events[0].mrrAfter)).toBe('79');
    expect(redis.del).toHaveBeenCalledWith('tenant:tenant_a:entitlements');
    expect(redis.publish).toHaveBeenCalledWith('tenant:tenant_a:plan-changed', expect.stringContaining('"plan":"PRO"'));
    const { planService } = await import('../../tenants/plan.service.js');
    const proOnly = planService.featureKeys().find((key) => planService.hasFeature('PRO', key) && !planService.hasFeature('STARTER', key))!;
    expect(planService.hasFeature(String(db.tenants[0].plan), proOnly)).toBe(true);
    expect(db.inApp).toEqual([expect.objectContaining({ userId: 'u_admin', type: 'plan.changed' })]);
    expect(queueAdd.mock.calls.some(([, job]) => job.template === 'plan_changed')).toBe(true);
    expect(db.activity.map((row) => row.type)).toEqual(['plan.change_requested', 'plan.changed']);
    expect((await app.inject({ method: 'POST', url: `/api/internal/subscriptions/plan-change-requests/${requestId}/decision`, payload: { decision: 'REJECT', reason: REASON } })).statusCode).toBe(409);
  });

  it('ACC-L6-1 a rejection keeps the plan and tells the tenant why', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/tenants/me/plan-change', payload: { plan: 'ENTERPRISE' } });
    const requestId = db.requests[0].id;
    const rejected = await app.inject({ method: 'POST', url: `/api/internal/subscriptions/plan-change-requests/${requestId}/decision`, payload: { decision: 'REJECT', reason: 'Enterprise needs a signed MSA first' } });
    expect(rejected.json().request).toMatchObject({ status: 'REJECTED', decisionReason: 'Enterprise needs a signed MSA first' });
    expect(db.tenants[0].plan).toBe('STARTER');
    expect(db.inApp).toEqual([expect.objectContaining({ type: 'plan.change_rejected', body: 'Enterprise needs a signed MSA first' })]);
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenants/me/plan-change', payload: { plan: 'STARTER' } })).json()).toMatchObject({ error: 'SAME_PLAN' });
    tenantUser.role = 'TENANT_STAFF';
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenants/me/plan-change', payload: { plan: 'PRO' } })).statusCode).toBe(403);
  });

  it('ACC-SUB-2 a signed customer.subscription.updated fixture changes the plan once and writes an event', async () => {
    await enableStripe();
    const event = {
      id: 'evt_sub_updated_1',
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_a',
          object: 'subscription',
          customer: 'cus_a',
          status: 'active',
          cancel_at_period_end: false,
          canceled_at: null,
          trial_end: null,
          metadata: { tenantId: 'tenant_a' },
          items: { data: [{ id: 'si_1', price: { id: 'price_pro_monthly' }, current_period_start: 1_790_000_000, current_period_end: 1_792_592_000 }] }
        }
      }
    };
    const first = await signedWebhook(event);
    expect(first.statusCode).toBe(200);
    expect(db.tenants[0].plan).toBe('PRO');
    expect(db.subscriptions[0]).toMatchObject({ plan: 'PRO', stripeSubscriptionId: 'sub_stripe_a', stripeCustomerId: 'cus_a', status: 'ACTIVE' });
    expect(db.subscriptions[0].currentPeriodEnd).toEqual(new Date(1_792_592_000 * 1000));
    expect(db.events).toEqual([expect.objectContaining({ type: 'PLAN_CHANGED', source: 'STRIPE_WEBHOOK', stripeEventId: 'evt_sub_updated_1' })]);
    await signedWebhook(event);
    expect(db.events).toHaveLength(1);
    const forged = await app.inject({ method: 'POST', url: '/api/v1/payments/webhook/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' }, payload: JSON.stringify({ ...event, id: 'evt_forged' }) });
    expect(forged.statusCode).toBe(400);
  });

  it('ACC-L6-2 signed invoice.payment_failed fixtures write DunningEvents and enrol the invoice in dunning (attempt 2 no longer suspends); invoice.paid recovers and lifts', async () => {
    await enableStripe();
    const invoice = (attempt: number) => ({ id: 'in_42', object: 'invoice', customer: 'cus_b', attempt_count: attempt, metadata: {}, parent: { subscription_details: { metadata: { tenantId: 'tenant_b' } } } });
    await signedWebhook({ id: 'evt_fail_1', object: 'event', type: 'invoice.payment_failed', data: { object: invoice(1) } });
    await signedWebhook({ id: 'evt_fail_2', object: 'event', type: 'invoice.payment_failed', data: { object: invoice(2) } });
    await signedWebhook({ id: 'evt_fail_2_again', object: 'event', type: 'invoice.payment_failed', data: { object: invoice(2) } });
    expect(suspension.suspendTenant).not.toHaveBeenCalled();
    expect(dunning.enrollInvoice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 'tenant_b', invoiceId: 'in_42', source: 'STRIPE' }));
    await signedWebhook({ id: 'evt_paid', object: 'event', type: 'invoice.paid', data: { object: { ...invoice(2), metadata: {}, parent: null } } });
    expect(dunning.recoverEnrollment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 'tenant_b', invoiceRefs: ['in_42'] }));
    expect(suspension.liftDunningSuspensionForInvoice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 'tenant_b', invoiceRef: 'in_42' }));
    expect(db.dunning.map((row) => [row.eventType, row.attempt])).toEqual([['payment_failed', 1], ['payment_failed', 2], ['payment_succeeded', 0]]);
    expect(db.activity.map((row) => row.type)).toEqual(['payment.failed', 'payment.failed', 'payment.succeeded']);
  });

  it('ACC-SUB-3 ACC-SUB-4 the detail returns only that tenant; an ACTIVE pricing override lowers its MRR', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/internal/subscriptions/tenant_a' });
    expect(before.json()).toMatchObject({ tenant: { id: 'tenant_a' }, subscription: { plan: 'STARTER' }, mrr: { amount: '29.00', currency: 'GBP' } });
    expect(JSON.stringify(before.json())).not.toContain('tenant_b');
    const created = await app.inject({ method: 'POST', url: '/api/internal/subscriptions/overrides', payload: { tenantId: 'tenant_a', discountPercent: 20, reason: 'Two-year commitment discount' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().override).toMatchObject({ status: 'ACTIVE', discountPercent: '20.00' });
    const after = await app.inject({ method: 'GET', url: '/api/internal/subscriptions/tenant_a' });
    expect(after.json().mrr).toMatchObject({ amount: '23.20', currency: 'GBP' });
    const list = await app.inject({ method: 'GET', url: '/api/internal/subscriptions' });
    expect(list.json().data.find((row: { tenant: { id: string } }) => row.tenant.id === 'tenant_a').mrr).toMatchObject({ amount: '23.20' });
    expect(list.json().data.find((row: { tenant: { id: string } }) => row.tenant.id === 'tenant_b').mrr).toMatchObject({ amount: '79.00' });
    expect((await app.inject({ method: 'GET', url: '/api/internal/subscriptions/tenant_zz' })).statusCode).toBe(404);
  });

  it('ACC-SUB-5 without Stripe the billing portal is unavailable (the portal then files a BILLING_QUERY ticket)', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/billing/portal-session' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'BILLING_PORTAL_UNAVAILABLE' });
  });

  it('ACC-DUN-5 a save offer is created PENDING, approved with a code and redeemed once as a PLATFORM credit note', async () => {
    db.invoices.push({ id: 'inv_p1', tenantId: 'tenant_a', kind: 'PLATFORM', invoiceNumber: 'FW-202610-1', status: 'SENT', total: '79.00', currency: 'GBP', createdAt: new Date('2026-10-01') });
    const created = await app.inject({ method: 'POST', url: '/api/internal/dunning/save-offers', payload: { tenantId: 'tenant_a', discount: 20, reason: 'Retention after price rise' } });
    expect(created.statusCode).toBe(201);
    expect(db.offers[0]).toMatchObject({ status: 'PENDING', code: null });
    const approved = await app.inject({ method: 'POST', url: `/api/internal/dunning/save-offers/${db.offers[0].id}/approve`, payload: { reason: REASON } });
    expect(approved.statusCode).toBe(200);
    const code = approved.json().offer.code as string;
    expect(code).toMatch(/^SAVE-[A-Z2-9]{8}$/);
    expect(db.inApp).toEqual([expect.objectContaining({ type: 'save_offer.available', body: expect.stringContaining(code) })]);

    const redeemed = await app.inject({ method: 'POST', url: `/api/v1/tenants/me/save-offers/${code.toLowerCase()}/redeem` });
    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json()).toMatchObject({ via: 'CREDIT_NOTE', invoiceNumber: 'FW-202610-1', amount: '20.00' });
    expect(db.credits).toEqual([expect.objectContaining({ kind: 'PLATFORM', tenantId: 'tenant_a', invoiceId: 'inv_p1' })]);
    expect(db.offers[0]).toMatchObject({ status: 'REDEEMED' });
    expect((await app.inject({ method: 'POST', url: `/api/v1/tenants/me/save-offers/${code}/redeem` })).json()).toMatchObject({ error: 'ALREADY_REDEEMED' });
    expect(db.activity.map((row) => row.type)).toContain('save_offer.redeemed');
  });
});
