import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publishPythonServiceJobMock = vi.hoisted(() => vi.fn(async () => undefined));
const createTrackingEventMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../queues/python-services.js', () => ({
  publishPythonServiceJob: publishPythonServiceJobMock
}));

vi.mock('../tracking/tracking-event.service.js', () => ({
  createTrackingEvent: createTrackingEventMock,
  buildStatusTitle: vi.fn((status: string) => status),
  statusToEventType: vi.fn((status: string) => status)
}));

vi.mock('../../shared/utils/pricing.js', () => ({
  calculateShipmentPrice: vi.fn(async () => ({
    total: 10,
    currency: 'GBP',
    breakdown: [],
    chargeableWeightKg: 1
  }))
}));

vi.mock('../../shared/utils/trackingNumber.js', () => ({
  generateTrackingNumber: vi.fn(async () => 'FW-CUSTOMS-001')
}));

vi.mock('../../queues/queues.js', () => ({
  notificationQueue: { add: vi.fn(async () => undefined) },
  webhookQueue: { add: vi.fn(async () => undefined) }
}));

import { registerCustomsRoutes } from './customs.routes.js';
import { customsService } from './customs.service.js';
import { registerShipmentRoutes } from '../shipments/shipments.routes.js';

function decorateTenantApp(app: any, tenantId = 'tenant-a') {
  app.decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-a', role: 'TENANT_ADMIN', tenantId };
  });
  app.addHook('onRequest', (request: any, _reply: any, done: () => void) => {
    request.tenant = { id: tenantId, slug: tenantId, name: tenantId, plan: 'PRO' };
    done();
  });
}

describe('customs service', () => {
  const apps: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('cross-border shipment with requireCustomsDeclaration rule auto-creates DRAFT declaration', async () => {
    const app = Fastify();
    apps.push(app);
    const declarations: any[] = [];
    const tx: any = {
      shipment: {
        create: vi.fn(async ({ data }: any) => ({ id: 'ship-1', trackingNumber: data.trackingNumber, estimatedDelivery: null, ...data })),
        update: vi.fn(async ({ data }: any) => data)
      },
      shipmentItem: { createMany: vi.fn(async () => ({ count: 1 })) },
      shipmentEvent: { create: vi.fn(async () => ({})) },
      trackingEvent: { create: vi.fn(async () => ({ id: 'track-1', occurredAt: new Date() })) },
      trackingSnapshot: { create: vi.fn(async () => ({})) },
      usageRecord: { upsert: vi.fn(async () => ({})) },
      outboxEvent: { create: vi.fn(async () => ({})) },
      auditLog: { create: vi.fn(async () => ({})) },
      customsDeclaration: {
        create: vi.fn(async ({ data }: any) => {
          const row = { id: 'customs-1', ...data };
          declarations.push(row);
          return row;
        })
      }
    };
    const prisma = {
      shippingRule: {
        findMany: vi.fn(async () => [{
          id: 'rule-customs',
          tenantId: 'tenant-a',
          name: 'Cross-border customs',
          isActive: true,
          priority: 1,
          conditions: [{ field: 'destinationCountry', operator: 'neq', value: 'GB' }],
          actions: [{ type: 'requireCustomsDeclaration', value: true }],
          createdAt: new Date()
        }])
      },
      user: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (callback: any) => callback(tx))
    };
    (app as any).decorate('prisma', prisma);
    decorateTenantApp(app as any);
    await registerShipmentRoutes(app as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/shipments',
      payload: {
        originAddress: { country: 'GB' },
        destinationAddress: { country: 'NG' },
        items: [{ description: 'Phone charger', weightKg: 1, declaredValue: 20 }]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(declarations[0]).toEqual(expect.objectContaining({
      tenantId: 'tenant-a',
      shipmentId: 'ship-1',
      status: 'DRAFT',
      type: 'DDU'
    }));
  });

  it('POST /hs-lookup returns ranked suggestions for mobile phone charger', async () => {
    const app = Fastify();
    apps.push(app);
    const prisma = {};
    (app as any).decorate('prisma', prisma);
    decorateTenantApp(app as any);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [{ hsCode: '850440', description: 'Mobile phone charger', score: 0.99 }] })
    })));
    await registerCustomsRoutes(app as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenant/customs/hs-lookup',
      payload: { description: 'mobile phone charger' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().suggestions[0]).toEqual(expect.objectContaining({ hsCode: '850440' }));
  });

  it('restricted item GET returns warnings without hard-blocking', async () => {
    const app = Fastify();
    apps.push(app);
    (app as any).decorate('prisma', {});
    decorateTenantApp(app as any);
    await registerCustomsRoutes(app as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenant/customs/restricted-items?country=NG'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({ country: 'NG', hardBlock: false }));
    expect(response.json().items.length).toBeGreaterThan(0);
  });

  it('POST with invalid declaration type returns HTTP 422', async () => {
    const app = Fastify();
    apps.push(app);
    (app as any).decorate('prisma', {});
    decorateTenantApp(app as any);
    await registerCustomsRoutes(app as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenant/shipments/ship-1/customs/declaration',
      payload: {
        type: 'INVALID',
        items: [],
        totalValue: 0,
        currency: 'GBP'
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe('VALIDATION_ERROR');
  });

  it('rejects status transition from CLEARED back to DRAFT', async () => {
    const app = Fastify();
    apps.push(app);
    const declaration = { id: 'customs-1', tenantId: 'tenant-a', shipmentId: 'ship-1', status: 'CLEARED' };
    const prisma = {
      customsDeclaration: {
        findFirst: vi.fn(async () => declaration),
        update: vi.fn(async ({ data }: any) => ({ ...declaration, ...data }))
      }
    };
    (app as any).decorate('prisma', prisma);

    await expect(customsService.updateDeclaration(app as any, 'tenant-a', 'ship-1', { status: 'DRAFT' }))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(prisma.customsDeclaration.update).not.toHaveBeenCalled();
  });

  it('CUSTOMS_HOLD creates customer-visible TrackingEvent', async () => {
    const app = Fastify();
    apps.push(app);
    const declaration = { id: 'customs-1', tenantId: 'tenant-a', shipmentId: 'ship-1', status: 'SUBMITTED' };
    const prisma = {
      customsDeclaration: {
        findFirst: vi.fn(async () => declaration),
        update: vi.fn(async ({ data }: any) => ({ ...declaration, ...data }))
      },
      shipment: {
        findFirst: vi.fn(async () => ({ id: 'ship-1', trackingNumber: 'FW-1' }))
      }
    };
    (app as any).decorate('prisma', prisma);

    await customsService.updateDeclaration(app as any, 'tenant-a', 'ship-1', {
      status: 'HELD',
      holdReason: 'Missing invoice'
    });

    expect(createTrackingEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: 'CUSTOMS_HOLD',
      visibility: 'CUSTOMER_VISIBLE',
      description: 'Missing invoice'
    }));
  });

  it('DDP vs DDU is preserved and sent as duty responsibility to Python worker', async () => {
    const app = Fastify();
    apps.push(app);
    const prisma = {
      shipment: {
        findFirst: vi.fn(async () => ({ id: 'ship-1' })),
        update: vi.fn(async () => ({}))
      },
      customsDeclaration: {
        create: vi.fn(async ({ data }: any) => ({ id: 'customs-1', ...data }))
      }
    };
    (app as any).decorate('prisma', prisma);

    const declaration = await customsService.createDeclaration(app as any, 'tenant-a', 'ship-1', {
      type: 'DDP',
      items: [{ description: 'Charger', quantity: 1, value: 20 }],
      totalValue: 20,
      currency: 'GBP'
    });

    expect(declaration.type).toBe('DDP');
    expect(publishPythonServiceJobMock).toHaveBeenCalledWith(
      expect.anything(),
      'fauward:customs:generate',
      expect.objectContaining({
        options: expect.objectContaining({ dutyResponsibility: 'DDP' })
      })
    );
  });

  it('tenant A cannot read tenant B customs declaration', async () => {
    const app = Fastify();
    apps.push(app);
    const prisma = {
      customsDeclaration: {
        findFirst: vi.fn(async ({ where }: any) => (
          where.tenantId === 'tenant-b' ? { id: 'customs-b', tenantId: 'tenant-b', shipmentId: 'ship-b' } : null
        ))
      }
    };
    (app as any).decorate('prisma', prisma);
    decorateTenantApp(app as any, 'tenant-a');
    await registerCustomsRoutes(app as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenant/shipments/ship-b/customs/declaration'
    });

    expect(response.statusCode).toBe(404);
  });
});
