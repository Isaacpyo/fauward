import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRealtimeTrackingRoutes } from '../tracking.realtime.routes.js';

describe('tenant isolation', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();

    const prisma = {
      shipment: {
        findFirst: vi.fn(async ({ where }: any) => {
          if (where.tenantId === 'tenant-a' && where.id === 'shipment-a') {
            return { id: where.id, trackingNumber: 'FCL-202507-A3F9K2' };
          }
          return null;
        }),
        findUnique: vi.fn(async () => null),
      },
      trackingBreadcrumb: {
        findMany: vi.fn(async () => []),
      },
    };

    const redis = {
      hgetall: vi.fn(async () => ({})),
      set: vi.fn(async () => 'OK'),
      get: vi.fn(async () => null),
      incr: vi.fn(async () => 1),
      xadd: vi.fn(async () => '1-0'),
      xtrim: vi.fn(async () => 0),
    };

    (app as any).decorate('prisma', prisma);
    (app as any).decorate('redis', redis);
    (app as any).decorate('authenticate', async (request: any) => {
      request.user = { sub: 'user-1', tenantId: 'tenant-a', role: 'TENANT_STAFF' };
    });
    app.addHook('onRequest', async (request: any) => {
      request.tenant = { id: 'tenant-a' };
    });

    await registerRealtimeTrackingRoutes(app);
  });

  it('returns 404 when tenant A reads tenant B shipment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tracking/shipment-b/state',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 200 when tenant A reads own shipment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tracking/shipment-a/state',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(200);
  });
});
