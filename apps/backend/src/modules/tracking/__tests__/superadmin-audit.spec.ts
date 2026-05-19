import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRealtimeTrackingRoutes } from '../tracking.realtime.routes.js';

vi.mock('../../modules/internal/internal-audit.js', () => ({
  writeInternalAudit: vi.fn(async () => {}),
}));

describe('superadmin audit', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();

    const prisma = {
      shipment: {
        findMany: vi.fn(async () => [
          { id: 'ship-1', tenantId: 'tenant-1', trackingNumber: 'FCL-202507-A3F9K2', escalationFlag: true, escalationFlaggedAt: new Date(), tenant: { name: 'T1' } }
        ]),
        count: vi.fn(async () => 1),
      },
      platformAuditLog: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'audit-1' })),
      },
    };

    (app as any).decorate('prisma', prisma);
    (app as any).decorate('redis', { hgetall: vi.fn(async () => ({})) });
    (app as any).decorate('authenticate', async (request: any) => {
      request.user = { sub: 'admin-1', role: 'SUPER_ADMIN' };
      request.platform = {
        user: { id: 'admin-1', email: 'admin@fauward.com', role: 'SUPER_ADMIN' },
        session: { id: 'sess-1' },
      };
    });

    await registerRealtimeTrackingRoutes(app);
  });

  it('returns 200 for SUPER_ADMIN', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/escalations',
      headers: { authorization: 'Bearer token' },
    });
    if (response.statusCode !== 200) {
      console.log('Response body:', response.body);
    }
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(1);
  });

  it('returns 403 for TENANT_ADMIN', async () => {
    const localApp = Fastify();
    const prisma = {
      shipment: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    };
    (localApp as any).decorate('prisma', prisma);
    (localApp as any).decorate('redis', { hgetall: vi.fn(async () => ({})) });
    (localApp as any).decorate('authenticate', async (request: any) => {
      request.user = { sub: 'user-1', role: 'TENANT_ADMIN' };
    });

    await registerRealtimeTrackingRoutes(localApp);

    const response = await localApp.inject({
      method: 'GET',
      url: '/api/v1/admin/escalations',
      headers: { authorization: 'Bearer token' },
    });
    expect(response.statusCode).toBe(403);
  });
});
