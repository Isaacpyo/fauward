import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import { LARGE_REFUND_PENCE } from '../../config/billing.js';

let currentPermissions: Permission[] = [];

const writeAuditMock = vi.fn(async () => undefined);
const createRefundMock = vi.fn(async () => ({ id: 're_stripe_001', status: 'APPROVED' }));

vi.mock('@fauward/internal-audit', () => ({
  writeAudit: writeAuditMock
}));

vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: 'staff_001', email: 'finance@fauward.com', role: 'FINANCE_ADMIN' },
      session: { id: 'staff_session_001' }
    };
  }
}));

vi.mock('../../middleware/require-platform-csrf.js', () => ({
  requirePlatformCsrf: async () => undefined
}));

vi.mock('../../middleware/require-internal-permission.js', () => ({
  requireInternalPermission: (permission: Permission) => async (_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    if (!currentPermissions.includes(permission)) {
      return reply.status(403).send({ error: 'Forbidden', permission });
    }
    return undefined;
  }
}));

vi.mock('../../services/staff-iam.service.js', () => ({
  staffPermissionContextForPlatformUser: async () => ({ permissions: currentPermissions })
}));

vi.mock('../../modules/payments/stripe.service.js', () => ({
  stripeService: {
    createRefund: createRefundMock
  }
}));

const payment = {
  id: 'pay_001',
  tenantId: 'tenant_001',
  invoiceId: 'inv_001',
  amount: 1000,
  currency: 'GBP',
  gatewayRef: 'pi_001',
  invoice: {
    id: 'inv_001',
    invoiceNumber: 'INV-001',
    status: 'PAID',
    total: 100000,
    currency: 'GBP'
  }
};

function createPrisma() {
  const refund = {
    id: 'refund_001',
    tenantId: payment.tenantId,
    paymentId: payment.id,
    amount: 25,
    reason: 'Duplicate payment',
    status: 'APPROVED',
    initiatedBy: 'staff_001'
  };

  return {
    payment: {
      findUnique: vi.fn(async () => payment)
    },
    refund: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...refund, ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...refund, ...data })),
      findMany: vi.fn(async () => [])
    },
    refundApproval: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data)
    }
  };
}

async function buildApp(prisma = createPrisma()) {
  const app = Fastify();
  app.decorate('prisma', prisma as never);
  const { registerInternalBillingRoutes } = await import('../../modules/internal/billing.routes.js');
  await registerInternalBillingRoutes(app);
  return { app, prisma };
}

describe('internal billing refund permissions', () => {
  beforeEach(() => {
    currentPermissions = ['revenue.invoices.refund'];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows a small refund for FINANCE_ADMIN with refund permission', async () => {
    const { app, prisma } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/billing/refunds',
      payload: { paymentId: payment.id, amount: 25, reason: 'Duplicate payment' }
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', amount: expect.anything(), reason: 'Duplicate payment' })
      })
    );
  });

  it('rejects a large refund without revenue.invoices.refund.large', async () => {
    const { app, prisma } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/billing/refunds',
      payload: { paymentId: payment.id, amount: 75000, reason: 'High-value refund' }
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.refund.create).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
    expect(response.json()).toEqual({
      error: 'Refunds of £500 or more require revenue.invoices.refund.large permission',
      code: 'PERMISSION_REQUIRED',
      required: 'revenue.invoices.refund.large'
    });
  });

  it('requires revenue.invoices.refund.large for exactly £500.00', async () => {
    const { app, prisma } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/billing/refunds',
      payload: { paymentId: payment.id, amount: LARGE_REFUND_PENCE, reason: 'Boundary refund' }
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.refund.create).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it('allows a £499.99 refund without revenue.invoices.refund.large', async () => {
    const { app, prisma } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/billing/refunds',
      payload: { paymentId: payment.id, amount: LARGE_REFUND_PENCE - 1, reason: 'Below threshold refund' }
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.refund.create).toHaveBeenCalled();
    expect(createRefundMock).toHaveBeenCalledWith(payment.gatewayRef, LARGE_REFUND_PENCE - 1, 'Below threshold refund');
  });

  it('allows a £500.00 refund with revenue.invoices.refund.large', async () => {
    currentPermissions = ['revenue.invoices.refund', 'revenue.invoices.refund.large'];
    const { app, prisma } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/billing/refunds',
      payload: { paymentId: payment.id, amount: LARGE_REFUND_PENCE, reason: 'Approved large refund' }
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', amount: expect.anything(), reason: 'Approved large refund' })
      })
    );
    expect(createRefundMock).toHaveBeenCalledWith(payment.gatewayRef, LARGE_REFUND_PENCE, 'Approved large refund');
  });

  it('rejects a refund without a reason', async () => {
    const { app, prisma } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/billing/refunds',
      payload: { paymentId: payment.id, amount: 25 }
    });

    expect(response.statusCode).toBe(400);
    expect(prisma.refund.create).not.toHaveBeenCalled();
  });

  it('returns 5xx and does not write audit when Stripe fails after validation', async () => {
    createRefundMock.mockRejectedValueOnce(new Error('Stripe unavailable'));
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/billing/refunds',
      payload: { paymentId: payment.id, amount: 2500, reason: 'Gateway failure case' }
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it('writes an audit entry with before and after invoice state for a successful refund', async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/billing/refunds',
      payload: { paymentId: payment.id, amount: 2500, reason: 'Duplicate payment' }
    });

    expect(response.statusCode).toBe(201);
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor_id: 'staff_001',
        action: 'invoice.refund',
        target_type: 'refund',
        reason: 'Duplicate payment',
        before: {
          payment,
          invoice: payment.invoice
        },
        after: {
          refund: expect.objectContaining({ paymentId: payment.id, reason: 'Duplicate payment' }),
          invoice: payment.invoice
        }
      })
    );
  });
});
