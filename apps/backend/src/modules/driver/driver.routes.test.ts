import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = req.user ?? { sub: 'user-driver-1', role: 'TENANT_DRIVER', tenantId: 'tenant-1' };
  })
}));
vi.mock('../../shared/middleware/requireRole.js', () => ({
  requireRole: vi.fn(() => async () => {})
}));
vi.mock('../notifications/notifications.routes.js', () => ({
  createInAppNotifications: vi.fn(async () => {})
}));

import { registerDriverRoutes } from './driver.routes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const DRIVER_FIXTURE = { id: 'driver-1', tenantId: 'tenant-1', userId: 'user-driver-1', isAvailable: true };

const ROUTE_FIXTURE = {
  id: 'route-1', tenantId: 'tenant-1', driverId: 'driver-1', date: new Date('2026-04-28'),
  stops: [
    { id: 'stop-1', routeId: 'route-1', stopOrder: 1, type: 'PICKUP', shipmentId: 'ship-1', completedAt: null, arrivedAt: null, estimatedAt: null },
    { id: 'stop-2', routeId: 'route-1', stopOrder: 2, type: 'DELIVERY', shipmentId: 'ship-2', completedAt: null, arrivedAt: null, estimatedAt: null }
  ]
};

const STOP_FIXTURE = { id: 'stop-1', routeId: 'route-1', stopOrder: 1, type: 'DELIVERY', shipmentId: 'ship-1', completedAt: null };
const SHIPMENT_FIXTURE = { id: 'ship-1', tenantId: 'tenant-1', trackingNumber: 'ACME-202506-ABC', status: 'OUT_FOR_DELIVERY' };

// ─────────────────────────────────────────────────────────────────────────────
// App builder
// ─────────────────────────────────────────────────────────────────────────────

function buildApp(roleOverride = 'TENANT_DRIVER') {
  const app = Fastify();
  const prisma = {
    driver: { findFirst: vi.fn().mockResolvedValue(DRIVER_FIXTURE) },
    route: { findFirst: vi.fn().mockResolvedValue(ROUTE_FIXTURE) },
    routeStop: {
      findFirst: vi.fn().mockResolvedValue(STOP_FIXTURE),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...STOP_FIXTURE, ...data }))
    },
    shipment: {
      findFirst: vi.fn().mockResolvedValue(SHIPMENT_FIXTURE),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...SHIPMENT_FIXTURE, ...data }))
    },
    shipmentEvent: { create: vi.fn().mockResolvedValue({}) },
    podAsset: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({ count: 2 }), findMany: vi.fn().mockResolvedValue([{ id: 'pod-1' }]) },
    notificationLog: { create: vi.fn().mockResolvedValue({}) },
    inAppNotification: { createMany: vi.fn().mockResolvedValue({}) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (cb: any) => {
      if (typeof cb === 'function') return cb(prisma);
      return Promise.all(cb);
    })
  };

  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (req: any) => {
    req.user = { sub: 'user-driver-1', role: roleOverride, tenantId: 'tenant-1' };
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
// GET /api/v1/driver/route
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/driver/route', () => {
  it('returns today\'s route with stops, pickup count, delivery count', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerDriverRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/driver/route',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stops).toHaveLength(2);
    expect(body.pickups).toBe(1);
    expect(body.deliveries).toBe(1);
  });

  it('returns empty route when driver has no profile', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    ctx.prisma.driver.findFirst = vi.fn().mockResolvedValue(null);
    await registerDriverRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/driver/route',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().stops).toHaveLength(0);
  });

  it('accepts a ?date= param and queries that day\'s route', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerDriverRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/driver/route?date=2026-05-10',
      headers: { Authorization: 'Bearer token' }
    });

    const routeQuery = ctx.prisma.route.findFirst.mock.calls[0][0];
    expect(routeQuery.where.date.gte.toISOString()).toContain('2026-05-10');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/driver/stops/:stopId/status
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/driver/stops/:stopId/status', () => {
  it('marks a stop COMPLETED and records location', async () => {
    const ctx = buildApp('TENANT_DRIVER');
    apps.push(ctx);
    await registerDriverRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/stops/stop-1/status',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED', location: { lat: 51.5, lng: -0.1 } })
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.routeStop.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: expect.any(Date) }) })
    );
  });

  it('rejects invalid status values with 400', async () => {
    const ctx = buildApp('TENANT_DRIVER');
    apps.push(ctx);
    await registerDriverRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/stops/stop-1/status',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DELIVERED' }) // not a valid stop status
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/driver/pod
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/driver/pod', () => {
  it('creates PodAsset records and transitions shipment to DELIVERED', async () => {
    const ctx = buildApp('TENANT_DRIVER');
    apps.push(ctx);
    await registerDriverRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/driver/pod',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipmentId: 'ship-1',
        photoBase64: 'data:image/png;base64,iVBOR...',
        signatureBase64: 'data:image/png;base64,AAAA...',
        recipientName: 'John Smith',
        notes: 'Left with neighbour'
      })
    });

    expect(res.statusCode).toBe(200);
    // The $transaction callback calls tx.shipment.update — tx === prisma in our mock
    expect(ctx.prisma.shipment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) })
    );
    expect(ctx.prisma.shipmentEvent.create).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/driver/shipments/:id/failed
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/driver/shipments/:id/failed', () => {
  it('transitions shipment to FAILED_DELIVERY and creates ShipmentEvent', async () => {
    const ctx = buildApp('TENANT_DRIVER');
    apps.push(ctx);
    await registerDriverRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/driver/shipments/ship-1/failed',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'No one home', notes: 'Attempted at 14:00', attemptedAt: new Date().toISOString() })
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.shipment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED_DELIVERY' }) })
    );
    expect(ctx.prisma.shipmentEvent.create).toHaveBeenCalledTimes(1);
  });
});
