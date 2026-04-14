import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = req.user ?? { sub: 'user-customer-1', role: 'CUSTOMER_USER', tenantId: 'tenant-1' };
  })
}));
vi.mock('../../shared/middleware/requireRole.js', () => ({
  requireRole: vi.fn(() => async () => {})
}));
vi.mock('../notifications/notifications.routes.js', () => ({
  createInAppNotifications: vi.fn(async () => {})
}));

import { registerReturnsRoutes } from './returns.routes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const DELIVERED_SHIPMENT = { id: 'ship-1', tenantId: 'tenant-1', trackingNumber: 'ACME-202506-ABC', status: 'DELIVERED', customerId: 'user-customer-1' };
const PENDING_SHIPMENT = { ...DELIVERED_SHIPMENT, status: 'PENDING' };

const REQUESTED_RETURN = {
  id: 'return-1', tenantId: 'tenant-1', shipmentId: 'ship-1',
  customerId: 'user-customer-1', status: 'REQUESTED', reason: 'DAMAGED', notes: null,
  shipment: { trackingNumber: 'ACME-202506-ABC', status: 'DELIVERED' }
};

// ─────────────────────────────────────────────────────────────────────────────
// App builder
// ─────────────────────────────────────────────────────────────────────────────

function buildApp(roleOverride = 'TENANT_ADMIN', returnOverride: any = REQUESTED_RETURN, shipmentOverride: any = DELIVERED_SHIPMENT) {
  const app = Fastify();
  const prisma = {
    returnRequest: {
      findMany: vi.fn().mockResolvedValue([REQUESTED_RETURN]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'return-new', ...data })),
      findFirst: vi.fn().mockResolvedValue(returnOverride),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...REQUESTED_RETURN, ...data }))
    },
    shipment: {
      findFirst: vi.fn().mockResolvedValue(shipmentOverride)
    },
    notificationLog: { create: vi.fn().mockResolvedValue({}) },
    inAppNotification: { createMany: vi.fn().mockResolvedValue({}) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'user-ops-1' }]) }
  };

  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (req: any) => {
    req.user = { sub: 'user-customer-1', role: roleOverride, tenantId: 'tenant-1' };
  });
  app.addHook('onRequest', (req, _reply, done) => {
    (req as any).tenant = { id: 'tenant-1', slug: 'acme', plan: 'PRO' };
    done();
  });

  return { app, prisma };
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  while (apps.length) {
    const ctx = apps.pop();
    if (ctx) await ctx.app.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/returns — customer creates return
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/returns', () => {
  it('creates return request with REQUESTED status for a DELIVERED shipment', async () => {
    const ctx = buildApp('CUSTOMER_USER', null, DELIVERED_SHIPMENT);
    apps.push(ctx);
    await registerReturnsRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/returns',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId: 'ship-1', reason: 'DAMAGED', notes: 'Box was crushed' })
    });

    expect(res.statusCode).toBe(201);
    const created = ctx.prisma.returnRequest.create.mock.calls[0][0].data;
    expect(created.status).toBe('REQUESTED');
    expect(created.tenantId).toBe('tenant-1');
    expect(created.shipmentId).toBe('ship-1');
    expect(created.reason).toBe('DAMAGED');
  });

  it('rejects return request for a non-DELIVERED shipment', async () => {
    const ctx = buildApp('CUSTOMER_USER', null, PENDING_SHIPMENT);
    apps.push(ctx);
    await registerReturnsRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/returns',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId: 'ship-1', reason: 'NO_LONGER_NEEDED' })
    });

    expect(res.statusCode).toBe(400);
    expect(ctx.prisma.returnRequest.create).not.toHaveBeenCalled();
  });

  it('rejects return request when shipment is not found', async () => {
    const ctx = buildApp('CUSTOMER_USER', REQUESTED_RETURN, null);
    apps.push(ctx);
    await registerReturnsRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/returns',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId: 'ship-unknown', reason: 'DAMAGED' })
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/returns/:id/approve
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/returns/:id/approve', () => {
  it('TENANT_STAFF can approve a return request', async () => {
    const ctx = buildApp('TENANT_STAFF', REQUESTED_RETURN);
    apps.push(ctx);
    await registerReturnsRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/returns/return-1/approve',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) })
    );
  });

  it('calls createInAppNotifications (return_approved) on approval', async () => {
    const { createInAppNotifications } = await import('../notifications/notifications.routes.js');
    const ctx = buildApp('TENANT_ADMIN', REQUESTED_RETURN);
    apps.push(ctx);
    await registerReturnsRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/returns/return-1/approve',
      headers: { Authorization: 'Bearer token' }
    });

    expect(createInAppNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'return_approved' })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/returns/:id/reject
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/returns/:id/reject', () => {
  it('transitions status to REJECTED and calls createInAppNotifications', async () => {
    const { createInAppNotifications } = await import('../notifications/notifications.routes.js');
    const ctx = buildApp('TENANT_ADMIN', REQUESTED_RETURN);
    apps.push(ctx);
    await registerReturnsRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/returns/return-1/reject',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Outside return window' })
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) })
    );
    expect(createInAppNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'return_rejected' })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/returns/:id/status — invalid transition
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/returns/:id/status — transition validation', () => {
  it('rejects an invalid transition (REQUESTED → RECEIVED) with 400', async () => {
    const ctx = buildApp('TENANT_ADMIN', REQUESTED_RETURN);
    apps.push(ctx);
    await registerReturnsRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/returns/return-1/status',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RECEIVED' }) // invalid: must go through APPROVED → LABEL_ISSUED → PICKED_UP → IN_HUB → RECEIVED
    });

    expect(res.statusCode).toBe(400);
    expect(ctx.prisma.returnRequest.update).not.toHaveBeenCalled();
  });

  it('allows the valid next transition (REQUESTED → APPROVED) via approve endpoint', async () => {
    const ctx = buildApp('TENANT_ADMIN', REQUESTED_RETURN);
    apps.push(ctx);
    await registerReturnsRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/returns/return-1/approve',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.returnRequest.update).toHaveBeenCalled();
  });
});
