import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerShipmentRoutes } from './shipments.routes.js';

async function buildTestApp() {
  const app = Fastify();

  const shipments = [
    { id: 'ship-a1', tenantId: 'tenant-a', trackingNumber: 'A-001', status: 'PENDING' },
    { id: 'ship-b1', tenantId: 'tenant-b', trackingNumber: 'B-001', status: 'PENDING' }
  ];

  const prisma = {
    shipment: {
      findMany: vi.fn(async ({ where }: any) => shipments.filter((shipment) => shipment.tenantId === where.tenantId)),
      count: vi.fn(async ({ where }: any) => shipments.filter((shipment) => shipment.tenantId === where.tenantId).length),
      findFirst: vi.fn(async ({ where }: any) => {
        return shipments.find((shipment) => shipment.id === where.id && shipment.tenantId === where.tenantId) ?? null;
      })
    }
  };

  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (request: any) => {
    request.user = {
      sub: 'user-a',
      role: 'TENANT_ADMIN',
      tenantId: 'tenant-a'
    };
  });

  app.addHook('onRequest', (request, _reply, done) => {
    (request as any).tenant = {
      id: 'tenant-a',
      slug: 'tenant-a',
      plan: 'PRO'
    };
    done();
  });

  await registerShipmentRoutes(app as any);
  return { app, prisma };
}

describe('tenant isolation for shipments routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildTestApp>>> = [];

  afterEach(async () => {
    while (apps.length) {
      const current = apps.pop();
      if (current) await current.app.close();
    }
  });

  it('does not return tenant B shipments in tenant A list', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/shipments'
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].id).toBe('ship-a1');
    expect(ctx.prisma.shipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' })
      })
    );
  });

  it('returns 404 for cross-tenant shipment id lookup (no data leak)', async () => {
    const ctx = await buildTestApp();
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/shipments/ship-b1'
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Shipment not found' });
  });
});

