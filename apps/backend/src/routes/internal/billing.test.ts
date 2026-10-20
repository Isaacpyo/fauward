import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

let currentPermissions: Permission[] = [];
let actorId = 'pu_requester';
let stripeConfigured = true;

const writeAuditMock = vi.fn(async () => undefined);
const createRefundMock = vi.fn(async (_input: { paymentIntentOrCharge: string; amountMajor: string; currency: string; idempotencyKey: string }) => ({ id: 're_stripe_001', status: 'succeeded' }));

vi.mock('@fauward/internal-audit', () => ({ writeAudit: writeAuditMock }));

vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: actorId, email: `${actorId}@fauward.com`, role: 'PLATFORM_FINANCE', mfaEnabled: true },
      session: { id: 'staff_session_001', mfaVerifiedAt: new Date() }
    };
  }
}));
vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../middleware/require-internal-permission.js', () => ({
  requireInternalPermission: (permission: Permission) => async (_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    if (!currentPermissions.includes(permission)) return reply.status(403).send({ error: 'Forbidden', permission });
    return undefined;
  }
}));
vi.mock('../../services/staff-iam.service.js', () => ({
  platformUserHasConsolePermission: async (_db: unknown, _user: unknown, permission: Permission) => currentPermissions.includes(permission)
}));
vi.mock('../../modules/payments/stripe.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../modules/payments/stripe.service.js')>();
  return { ...actual, stripeService: { isConfigured: () => stripeConfigured, createRefund: createRefundMock } };
});

type PaymentRow = { id: string; tenantId: string; amount: Prisma.Decimal; currency: string; gatewayRef: string | null; refundedAmount: Prisma.Decimal };
type RefundRow = {
  id: string;
  tenantId: string;
  paymentId: string;
  amount: Prisma.Decimal;
  currency: string | null;
  reason: string | null;
  status: string;
  gatewayRef: string | null;
  idempotencyKey: string | null;
  initiatedBy: string | null;
  failureReason: string | null;
  createdAt: Date;
};
type ApprovalRow = { id: string; refundId: string; requestedBy: string; approvedBy: string | null; status: string; reason: string; decidedAt: Date | null };

function createPrisma(payment: Partial<PaymentRow> = {}) {
  const payments = new Map<string, PaymentRow>([
    ['pay_001', { id: 'pay_001', tenantId: 'tenant_001', amount: new Prisma.Decimal('100.00'), currency: 'GBP', gatewayRef: 'pi_001', refundedAmount: new Prisma.Decimal(0), ...payment }]
  ]);
  const refunds = new Map<string, RefundRow>();
  const approvals = new Map<string, ApprovalRow>();
  const locks: string[] = [];
  let seq = 0;
  const withApprovals = (row: RefundRow) => ({ ...row, approvals: [...approvals.values()].filter((approval) => approval.refundId === row.id) });
  const matches = (row: RefundRow, where: { id?: string | { not: string }; paymentId?: string; tenantId?: string; status?: { in: string[] } }) =>
    (typeof where.id !== 'string' || row.id === where.id) &&
    (typeof where.id !== 'object' || row.id !== where.id.not) &&
    (!where.paymentId || row.paymentId === where.paymentId) &&
    (!where.tenantId || row.tenantId === where.tenantId) &&
    (!where.status || where.status.in.includes(row.status));

  const prisma = {
    payments,
    refunds,
    approvals,
    locks,
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(`${strings.join('?')}|${values.join(',')}`);
      return [];
    }),
    payment: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => payments.get(where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const row = payments.get(where.id);
        return row && row.tenantId === where.tenantId ? row : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; tenantId: string }; data: { refundedAmount: { increment: Prisma.Decimal } } }) => {
        const row = payments.get(where.id);
        if (!row || row.tenantId !== where.tenantId) return { count: 0 };
        row.refundedAmount = row.refundedAmount.plus(data.refundedAmount.increment);
        return { count: 1 };
      })
    },
    refund: {
      findUnique: vi.fn(async ({ where, include }: { where: { id?: string; idempotencyKey?: string }; include?: { payment?: boolean } }) => {
        const row = where.id ? refunds.get(where.id) : [...refunds.values()].find((item) => item.idempotencyKey === where.idempotencyKey);
        if (!row) return null;
        return include?.payment ? { ...withApprovals(row), payment: payments.get(row.paymentId) } : withApprovals(row);
      }),
      findMany: vi.fn(async () => [...refunds.values()].map(withApprovals)),
      create: vi.fn(async ({ data }: { data: Omit<RefundRow, 'id' | 'gatewayRef' | 'failureReason' | 'createdAt'> & { approvals?: { create: { requestedBy: string; reason: string; status: string } } } }) => {
        if ([...refunds.values()].some((row) => row.idempotencyKey === data.idempotencyKey)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
        }
        seq += 1;
        const { approvals: approvalInput, ...rest } = data;
        const row: RefundRow = { id: `refund_${seq}`, gatewayRef: null, failureReason: null, createdAt: new Date(), ...rest };
        refunds.set(row.id, row);
        if (approvalInput) approvals.set(`approval_${seq}`, { id: `approval_${seq}`, refundId: row.id, approvedBy: null, decidedAt: null, ...approvalInput.create });
        return withApprovals(row);
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; tenantId: string }; data: Partial<RefundRow> }) => {
        const row = refunds.get(where.id);
        if (!row || row.tenantId !== where.tenantId) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      aggregate: vi.fn(async ({ where }: { where: Parameters<typeof matches>[1] }) => {
        const rows = [...refunds.values()].filter((row) => matches(row, where));
        return { _sum: { amount: rows.length ? rows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)) : null } };
      })
    },
    refundApproval: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<ApprovalRow> }) => Object.assign(approvals.get(where.id)!, data))
    },
    $transaction: vi.fn(async (input: unknown): Promise<unknown> => {
      if (typeof input === 'function') return input(prisma);
      return Promise.all(input as Array<Promise<unknown>>);
    })
  };
  return prisma;
}

const openApps: FastifyInstance[] = [];

async function buildApp(prisma = createPrisma()) {
  const app = Fastify();
  openApps.push(app);
  const routes: RouteOptions[] = [];
  app.addHook('onRoute', (route) => {
    routes.push(route);
  });
  app.decorate('prisma', prisma as never);
  const { registerInternalBillingRoutes } = await import('../../modules/internal/billing.routes.js');
  await registerInternalBillingRoutes(app);
  await app.ready();
  return { app, prisma, routes };
}

function refund(app: FastifyInstance, payload: Record<string, unknown>, key?: string) {
  return app.inject({ method: 'POST', url: '/api/internal/billing/refunds', headers: key ? { 'idempotency-key': key } : {}, payload });
}

beforeEach(() => {
  currentPermissions = ['revenue.invoices.read', 'revenue.invoices.refund'];
  actorId = 'pu_requester';
  stripeConfigured = true;
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
  vi.clearAllMocks();
});

describe('minor-unit conversion (D4)', () => {
  it('ACC-BIL-1 converts major-unit strings exactly per currency', async () => {
    const { toMinorUnits } = await import('../../modules/payments/stripe.service.js');
    expect(toMinorUnits('12.34', 'GBP')).toBe(1234);
    expect(toMinorUnits('0.10', 'usd')).toBe(10);
    expect(toMinorUnits('1500', 'JPY')).toBe(1500);
    expect(toMinorUnits('1500.00', 'JPY')).toBe(1500);
    expect(toMinorUnits('1.234', 'KWD')).toBe(1234);
    expect(() => toMinorUnits('12.345', 'GBP')).toThrow(/decimal places/);
    expect(() => toMinorUnits('15.50', 'JPY')).toThrow(/decimal places/);
    expect(() => toMinorUnits('-1', 'GBP')).toThrow(/Invalid amount/);
  });
});

describe('refund integrity (WP-0.6)', () => {
  it('ACC-BIL-1 refunding 12.34 GBP sends 12.34 GBP to the Stripe adapter, stores 12.34 and settles refundedAmount', async () => {
    const { app, prisma } = await buildApp();
    const response = await refund(app, { paymentId: 'pay_001', amount: '12.34', reason: 'Duplicate charge on invoice' }, 'key-1');

    expect(response.statusCode).toBe(201);
    expect(createRefundMock).toHaveBeenCalledWith(expect.objectContaining({ paymentIntentOrCharge: 'pi_001', amountMajor: '12.34', currency: 'GBP' }));
    const row = [...prisma.refunds.values()][0];
    expect(row.amount.toFixed(2)).toBe('12.34');
    expect(row.currency).toBe('GBP');
    expect(row.status).toBe('SUCCEEDED');
    expect(row.gatewayRef).toBe('re_stripe_001');
    expect(prisma.payments.get('pay_001')!.refundedAmount.toFixed(2)).toBe('12.34');
    expect(prisma.locks[0]).toContain('FOR UPDATE');
    expect(response.json()).toMatchObject({ refund: { amount: '12.34', status: 'SUCCEEDED' }, path: 'stripe' });
  });

  it('ACC-BIL-2 two refunds totalling more than the payment: the second returns 409 and nothing is sent to Stripe', async () => {
    const { app, prisma } = await buildApp();
    expect((await refund(app, { paymentId: 'pay_001', amount: '60.00', reason: 'Partial refund for damage' }, 'key-a')).statusCode).toBe(201);
    const second = await refund(app, { paymentId: 'pay_001', amount: '50.00', reason: 'Second partial refund' }, 'key-b');

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: 'OVER_REFUND', available: '40.00', currency: 'GBP' });
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    expect(prisma.refunds.size).toBe(1);
    expect(prisma.payments.get('pay_001')!.refundedAmount.toFixed(2)).toBe('60.00');
  });

  it('ACC-BIL-2 a pending approval also counts against the refundable balance', async () => {
    const { app } = await buildApp(createPrisma({ gatewayRef: null }));
    expect((await refund(app, { paymentId: 'pay_001', amount: '70.00', reason: 'Bank transfer refund' }, 'key-a')).statusCode).toBe(201);
    const second = await refund(app, { paymentId: 'pay_001', amount: '40.00', reason: 'Another bank refund' }, 'key-b');
    expect(second.statusCode).toBe(409);
  });

  it('ACC-BIL-3 a refund without gatewayRef needs a second approver; refundedAmount moves only after approval', async () => {
    const { app, prisma } = await buildApp(createPrisma({ gatewayRef: null }));
    const created = await refund(app, { paymentId: 'pay_001', amount: '25.00', reason: 'Refund by bank transfer' }, 'key-manual');
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ path: 'approval', approvalRequired: true, refund: { status: 'PENDING_APPROVAL' } });
    const refundId = (created.json() as { refund: { id: string } }).refund.id;
    expect([...prisma.approvals.values()]).toEqual([expect.objectContaining({ refundId, requestedBy: 'pu_requester', status: 'PENDING' })]);
    expect(prisma.payments.get('pay_001')!.refundedAmount.toFixed(2)).toBe('0.00');

    const own = await app.inject({ method: 'POST', url: `/api/internal/billing/refunds/${refundId}/approve`, payload: { reason: 'Approving my own refund' } });
    expect(own.statusCode).toBe(403);
    expect(own.json()).toMatchObject({ error: 'CANNOT_APPROVE_OWN' });
    expect(prisma.payments.get('pay_001')!.refundedAmount.toFixed(2)).toBe('0.00');

    actorId = 'pu_approver';
    const approved = await app.inject({ method: 'POST', url: `/api/internal/billing/refunds/${refundId}/approve`, payload: { reason: 'Checked the bank statement' } });
    expect(approved.statusCode).toBe(200);
    expect(prisma.refunds.get(refundId)!.status).toBe('RECORDED_MANUAL');
    expect([...prisma.approvals.values()][0]).toMatchObject({ status: 'APPROVED', approvedBy: 'pu_approver' });
    expect(prisma.payments.get('pay_001')!.refundedAmount.toFixed(2)).toBe('25.00');
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it('ACC-BIL-3 rejecting leaves refundedAmount unchanged', async () => {
    const { app, prisma } = await buildApp(createPrisma({ gatewayRef: null }));
    const refundId = ((await refund(app, { paymentId: 'pay_001', amount: '25.00', reason: 'Refund by bank transfer' }, 'k')).json() as { refund: { id: string } }).refund.id;
    actorId = 'pu_approver';
    const rejected = await app.inject({ method: 'POST', url: `/api/internal/billing/refunds/${refundId}/reject`, payload: { reason: 'Customer already credited' } });
    expect(rejected.statusCode).toBe(200);
    expect(prisma.refunds.get(refundId)!.status).toBe('REJECTED');
    expect(prisma.payments.get('pay_001')!.refundedAmount.toFixed(2)).toBe('0.00');
  });

  it('large refunds (>= 500.00) without revenue.invoices.refund.large go to the approval path; with it they go to Stripe', async () => {
    const big = createPrisma({ amount: new Prisma.Decimal('900.00') });
    const { app } = await buildApp(big);
    const pending = await refund(app, { paymentId: 'pay_001', amount: '500.00', reason: 'Service outage credit' }, 'large-1');
    expect(pending.json()).toMatchObject({ path: 'approval', refund: { status: 'PENDING_APPROVAL' } });
    expect(createRefundMock).not.toHaveBeenCalled();

    const small = await refund(app, { paymentId: 'pay_001', amount: '399.99', reason: 'Service outage credit' }, 'small-1');
    expect(small.json()).toMatchObject({ path: 'stripe' });

    currentPermissions.push('revenue.invoices.refund.large');
    const allowed = createPrisma({ amount: new Prisma.Decimal('900.00') });
    const { app: app2 } = await buildApp(allowed);
    const direct = await refund(app2, { paymentId: 'pay_001', amount: '500.00', reason: 'Service outage credit' }, 'large-2');
    expect(direct.json()).toMatchObject({ path: 'stripe', refund: { status: 'SUCCEEDED' } });
  });

  it('ACC-BIL-4 the same idempotency key twice makes one Stripe call and one Refund row', async () => {
    const { app, prisma } = await buildApp();
    const first = await refund(app, { paymentId: 'pay_001', amount: '10.00', reason: 'Duplicate charge refund' }, 'same-key');
    const second = await refund(app, { paymentId: 'pay_001', amount: '10.00', reason: 'Duplicate charge refund' }, 'same-key');
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ replayed: true });
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    expect(prisma.refunds.size).toBe(1);
  });

  it('ACC-BIL-5 a Stripe failure records FAILED with the reason and returns 502 VENDOR_ERROR', async () => {
    createRefundMock.mockRejectedValueOnce(new Error('charge_already_refunded'));
    const { app, prisma } = await buildApp();
    const response = await refund(app, { paymentId: 'pay_001', amount: '10.00', reason: 'Duplicate charge refund' }, 'fail-key');
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: 'VENDOR_ERROR', vendor: 'stripe', degraded: true });
    const row = [...prisma.refunds.values()][0];
    expect(row.status).toBe('FAILED');
    expect(row.failureReason).toContain('charge_already_refunded');
    expect(prisma.payments.get('pay_001')!.refundedAmount.toFixed(2)).toBe('0.00');
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'refund.failed' }));
  });

  it('without Stripe configured, a gateway payment refund goes to manual approval (vendor-free default)', async () => {
    stripeConfigured = false;
    const { app } = await buildApp();
    const response = await refund(app, { paymentId: 'pay_001', amount: '10.00', reason: 'Refund while Stripe is down' }, 'no-stripe');
    expect(response.json()).toMatchObject({ path: 'approval' });
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it('rejects a refund without a reason (dangerous action)', async () => {
    const { app } = await buildApp();
    const response = await refund(app, { paymentId: 'pay_001', amount: '10.00' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'REASON_REQUIRED' });
  });

  it('rejects amounts with too many decimals for the currency', async () => {
    const { app } = await buildApp();
    const response = await refund(app, { paymentId: 'pay_001', amount: '1.234', reason: 'Fractional refund attempt' }, 'dec');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'INVALID_AMOUNT' });
  });

  it('every billing route in DANGEROUS_ROUTES uses fresh MFA and a reason guard', async () => {
    const { routes } = await buildApp();
    const { DANGEROUS_ROUTES } = await import('../../modules/internal/dangerous-routes.js');
    const { requireFreshMfa } = await import('../../middleware/require-fresh-platform-mfa.js');
    for (const expected of DANGEROUS_ROUTES.filter((route) => route.url.startsWith('/api/internal/billing/'))) {
      const route = routes.find((item) => item.url === expected.url && [item.method].flat().includes(expected.method));
      expect(route, `${expected.method} ${expected.url}`).toBeDefined();
      const handlers = [route!.preHandler].flat();
      expect(handlers).toContain(requireFreshMfa);
      expect(handlers.some((handler) => typeof handler === 'function' && 'reasonGuard' in handler)).toBe(true);
    }
  });
});
