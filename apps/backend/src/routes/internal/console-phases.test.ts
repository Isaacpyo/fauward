import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

let currentPermissions: Permission[] = [];
const writeAuditMock = vi.fn(async () => undefined);

vi.mock('@fauward/internal-audit', () => ({
  writeAudit: writeAuditMock
}));

vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: 'staff_001', email: 'ops@fauward.com', role: 'SUPER_ADMIN' },
      session: { id: 'platform_session_001' }
    };
  }
}));

vi.mock('../../middleware/require-platform-csrf.js', () => ({
  requirePlatformCsrf: async () => undefined
}));

vi.mock('../../middleware/require-internal-permission.js', () => ({
  requireInternalPermission: (permission: Permission) => async (_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    if (!currentPermissions.includes(permission)) return reply.status(403).send({ error: 'Forbidden', permission });
    return undefined;
  }
}));

vi.mock('../../services/staff-iam.service.js', () => ({
  staffPermissionContextForPlatformUser: async () => ({
    staff: { id: 'staff_user_001' },
    roles: ['FINANCE_ADMIN'],
    permissions: currentPermissions
  })
}));

function delegate(overrides: Record<string, unknown> = {}) {
  return {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'created_001', ...data })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'updated_001', ...data })),
    upsert: vi.fn(async (args: unknown) => ({ id: 'upserted_001', args })),
    count: vi.fn(async () => 0),
    ...overrides
  };
}

async function buildApp(prisma: Record<string, unknown>) {
  const app = Fastify();
  app.decorate('prisma', prisma as never);
  const { registerInternalConsolePhaseRoutes } = await import('../../modules/internal/console-phases.routes.js');
  await registerInternalConsolePhaseRoutes(app);
  return app;
}

describe('internal console phase routes', () => {
  beforeEach(() => {
    currentPermissions = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('suspends a tenant after dunning retry attempts exceed the limit and writes audit', async () => {
    currentPermissions = ['revenue.dunning.write'];
    const tenant = { id: 'tenant_001', name: 'Acme', status: 'ACTIVE' };
    const prisma = {
      invoice: { findUnique: vi.fn(async () => ({ id: 'inv_001', tenantId: tenant.id, tenant })) },
      tenant: { update: vi.fn(async () => ({ ...tenant, status: 'SUSPENDED' })) },
      dunningEvent: delegate({ count: vi.fn(async () => 3) })
    };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/dunning/retry/inv_001', payload: { reason: 'Retry ceiling' } });

    expect(response.statusCode).toBe(200);
    expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: tenant.id }, data: { status: 'SUSPENDED' } });
    expect(writeAuditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'dunning.tenant.suspend_after_retry_limit', target_id: tenant.id }));
  });

  it('rejects self approval for JIT requests', async () => {
    currentPermissions = ['trust.jit.approve'];
    const prisma = {
      jitAccessRequest: delegate({ findUnique: vi.fn(async () => ({ id: 'jit_001', requesterPlatformUserId: 'staff_001', rootRequest: false, durationMinutes: 60 })) }),
      jitAccessApproval: delegate()
    };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/jit/requests/jit_001/approve', payload: { notes: 'self' } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Self approval is not allowed' });
  });

  it('requires CFO-level permission for quote discounts over 25 percent', async () => {
    currentPermissions = ['gtm.contracts.write', 'gtm.contracts.discount.large'];
    const prisma = {
      salesQuote: delegate({ findUnique: vi.fn(async () => ({ id: 'quote_001', discountPercent: '30' })) })
    };
    const app = await buildApp(prisma);

    const response = await app.inject({ method: 'POST', url: '/api/internal/contracts/quotes/quote_001/approve', payload: { reason: 'large discount' } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'CFO approval required', required: 'revenue.subscriptions.override' });
  });
});
