import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerRealtimeTrackingRoutes } from '../tracking.realtime.routes.js';

// ACC-LEG-2 (WP-1.6): the cross-tenant escalations list behind a tenant SUPER_ADMIN JWT is gone; WP-2.11 rebuilds it
// under /api/internal/operations with console auth.
describe('legacy admin escalations list', () => {
  it('ACC-LEG-2 GET /api/v1/admin/escalations is no longer registered (404)', async () => {
    const app = Fastify();
    app.decorate('prisma', { shipment: { findMany: vi.fn(), count: vi.fn() } } as never);
    app.decorate('redis', { hgetall: vi.fn(async () => ({})) } as never);
    app.decorate('authenticate', async () => undefined);
    await registerRealtimeTrackingRoutes(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/escalations' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
