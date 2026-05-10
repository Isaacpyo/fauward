import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

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
  amount: 1000,
  currency: 'GBP',
  gatewayRef: 'pi_001'
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
      payload: { paymentId: payment.id, amount: 750, reason: 'High-value refund' }
    });

    expect(response.statusCode).toBe(403);
    expect(prisma.refund.create).not.toHaveBeenCalled();
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

  it('writes an audit entry for a successful refund', async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/billing/refunds',
      payload: { paymentId: payment.id, amount: 25, reason: 'Duplicate payment' }
    });

    expect(response.statusCode).toBe(201);
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor_id: 'staff_001',
        action: 'invoice.refund',
        target_type: 'refund',
        reason: 'Duplicate payment'
      })
    );
  });
});
