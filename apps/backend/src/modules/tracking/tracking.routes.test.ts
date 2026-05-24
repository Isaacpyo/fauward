import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerTrackingRoutes } from './tracking.routes.js';

const SHIPMENT_FIXTURE = {
  id: 'ship-1',
  tenantId: 'tenant-1',
  trackingNumber: 'ACME-202506-ABC123',
  status: 'IN_TRANSIT',
  estimatedDelivery: new Date('2026-05-01T12:00:00Z'),
  originAddress: { line1: '1 Sender St', city: 'London', country: 'GB' },
  destinationAddress: { line1: '2 Receiver Rd', city: 'Manchester', country: 'GB' },
  events: [
    { id: 'ev-1', status: 'PENDING', timestamp: new Date('2026-04-28T10:00:00Z'), location: null },
    { id: 'ev-2', status: 'PROCESSING', timestamp: new Date('2026-04-28T11:00:00Z'), location: null },
    { id: 'ev-3', status: 'IN_TRANSIT', timestamp: new Date('2026-04-29T08:00:00Z'), location: { city: 'Birmingham' } }
  ]
};

function buildApp(shipment = SHIPMENT_FIXTURE as typeof SHIPMENT_FIXTURE | null, withTenant = true) {
  const app = Fastify();
  const prisma = {
    shipment: { findFirst: vi.fn().mockResolvedValue(shipment) }
  };

  (app as any).decorate('prisma', prisma);

  if (withTenant) {
    app.addHook('preHandler', async (request) => {
      (request as any).tenant = { id: 'tenant-1', slug: 'acme' };
    });
  }

  return { app, prisma };
}

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  while (apps.length) {
    const ctx = apps.pop();
    if (ctx) await ctx.app.close();
  }
});

describe('GET /api/v1/tracking/:trackingNumber', () => {
  it('returns tracking status, events, and public locations for the resolved tenant', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/ACME-202506-ABC123'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tracking_number).toBe('ACME-202506-ABC123');
    expect(body.status).toBe('IN_TRANSIT');
    expect(body.events).toHaveLength(3);
    expect(body.origin_city).toBe('London, GB');
    expect(body.destination_city).toBe('Manchester, GB');
  });

  it('normalises the tracking number to uppercase and scopes by tenant id', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/acme-202506-abc123'
    });

    expect(ctx.prisma.shipment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trackingNumber: 'ACME-202506-ABC123',
          tenantId: 'tenant-1'
        })
      })
    );
  });

  it('returns 404 for an unknown tracking number in the tenant context', async () => {
    const ctx = buildApp(null);
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/UNKNOWN-000000-ZZZZZZ'
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Shipment not found' });
  });

  it('does not require an Authorization header when tenant context exists', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/ACME-202506-ABC123'
    });

    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 before querying when tenant context is missing', async () => {
    const ctx = buildApp(SHIPMENT_FIXTURE, false);
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/ACME-202506-ABC123'
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'TENANT_REQUIRED' });
    expect(ctx.prisma.shipment.findFirst).not.toHaveBeenCalled();
  });

  it('includes public event fields', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/ACME-202506-ABC123'
    });

    const body = res.json();
    const lastEvent = body.events[body.events.length - 1];
    expect(lastEvent).toMatchObject({
      id: 'ev-3',
      status: 'IN_TRANSIT',
      location: 'Birmingham'
    });
    expect(lastEvent.timestamp).toBeTruthy();
    expect(lastEvent.description).toBe('Status updated to in transit');
  });
});
