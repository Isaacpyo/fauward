import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

// tracking routes import config directly — mock it
vi.mock('../../config/index.js', () => ({
  config: { platformDomain: 'fauward.com' }
}));

import { registerTrackingRoutes } from './tracking.routes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test app builder
// ─────────────────────────────────────────────────────────────────────────────

const SHIPMENT_FIXTURE = {
  id: 'ship-1',
  tenantId: 'tenant-1',
  trackingNumber: 'ACME-202506-ABC123',
  status: 'IN_TRANSIT',
  estimatedDelivery: new Date('2026-05-01T12:00:00Z'),
  originAddress: { line1: '1 Sender St', city: 'London', country: 'GB' },
  destinationAddress: { line1: '2 Receiver Rd', city: 'Manchester', country: 'GB' },
  events: [
    { id: 'ev-1', status: 'PENDING', timestamp: new Date('2026-04-28T10:00:00Z'), location: null, notes: null },
    { id: 'ev-2', status: 'PROCESSING', timestamp: new Date('2026-04-28T11:00:00Z'), location: null, notes: null },
    { id: 'ev-3', status: 'IN_TRANSIT', timestamp: new Date('2026-04-29T08:00:00Z'), location: { city: 'Birmingham' }, notes: 'Passed through hub' }
  ]
};

function buildApp(shipment = SHIPMENT_FIXTURE as typeof SHIPMENT_FIXTURE | null) {
  const app = Fastify();
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1', slug: 'acme' }) },
    shipment: { findFirst: vi.fn().mockResolvedValue(shipment) }
  };
  (app as any).decorate('prisma', prisma);
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
// GET /api/v1/tracking/:trackingNumber  (PUBLIC — no auth)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/tracking/:trackingNumber', () => {
  it('returns 200 with tracking number, status, events, and addresses when found via ?tenant= param', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/ACME-202506-ABC123?tenant=acme'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tracking_number).toBe('ACME-202506-ABC123');
    expect(body.status).toBe('IN_TRANSIT');
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toHaveLength(3);
    expect(typeof body.origin_city).toBe('string');
    expect(typeof body.destination_city).toBe('string');
  });

  it('normalises the tracking number to uppercase before querying', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/acme-202506-abc123?tenant=acme'
    });

    expect(ctx.prisma.shipment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ trackingNumber: 'ACME-202506-ABC123' })
      })
    );
  });

  it('returns 404 for an unknown tracking number', async () => {
    const ctx = buildApp(null); // no shipment found
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/UNKNOWN-000000-ZZZZZZ?tenant=acme'
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Shipment not found' });
  });

  it('does not require authentication — no Authorization header needed', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    // No Authorization header, no bearer token
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/ACME-202506-ABC123?tenant=acme'
    });

    // Should NOT get 401 — tracking is public
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(200);
  });

  it('includes all event fields (timestamp, status, location, notes)', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerTrackingRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/ACME-202506-ABC123?tenant=acme'
    });

    const body = res.json();
    const lastEvent = body.events[body.events.length - 1];
    expect(lastEvent.status).toBe('IN_TRANSIT');
    expect(lastEvent.timestamp).toBeTruthy();
  });
});
