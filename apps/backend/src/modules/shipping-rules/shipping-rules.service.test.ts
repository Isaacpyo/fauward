import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/utils/pricing.js', () => ({
  calculateShipmentPrice: vi.fn(async () => ({
    total: 10,
    currency: 'GBP',
    breakdown: [],
    chargeableWeightKg: 1
  }))
}));

vi.mock('../../shared/utils/trackingNumber.js', () => ({
  generateTrackingNumber: vi.fn(async () => 'FW-TEST-001')
}));

vi.mock('../../queues/queues.js', () => ({
  notificationQueue: { add: vi.fn(async () => undefined) },
  webhookQueue: { add: vi.fn(async () => undefined) }
}));

import { evaluateShippingRules } from './shipping-rules.engine.js';
import { registerShippingRulesRoutes } from './shipping-rules.routes.js';
import { shippingRulesService } from './shipping-rules.service.js';
import { registerShipmentRoutes } from '../shipments/shipments.routes.js';

const assignCarrierRule = {
  id: 'rule-assign',
  tenantId: 'tenant-a',
  name: 'NG light carrier',
  isActive: true,
  priority: 10,
  conditions: [
    { field: 'destinationCountry', operator: 'eq', value: 'NG' },
    { field: 'weightKg', operator: 'lt', value: 5 }
  ],
  actions: [{ type: 'assignCarrier', value: 'carrier-ng-light' }],
  createdAt: new Date()
};

async function buildRulesRouteApp(rule = assignCarrierRule) {
  const app = Fastify();
  const prisma = {
    shippingRule: {
      findFirst: vi.fn(async ({ where }: any) => (where.id === rule.id && where.tenantId === rule.tenantId ? rule : null)),
      findMany: vi.fn(async ({ where }: any) => (where.tenantId === rule.tenantId ? [rule] : [])),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    auditLog: {
      create: vi.fn(async () => ({}))
    }
  };
  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-a', role: 'TENANT_ADMIN', tenantId: 'tenant-a' };
  });
  app.addHook('onRequest', (request, _reply, done) => {
    (request as any).tenant = { id: 'tenant-a', slug: 'tenant-a', plan: 'PRO' };
    done();
  });
  await registerShippingRulesRoutes(app as any);
  return { app, prisma };
}

describe('shipping rules service', () => {
  const apps: any[] = [];

  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('fires assignCarrier for destinationCountry=NG and weightKg < 5', () => {
    const matches = evaluateShippingRules([assignCarrierRule], {
      destinationCountry: 'NG',
      weightKg: 4.5
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].actions).toEqual([{ type: 'assignCarrier', value: 'carrier-ng-light' }]);
  });

  it('lower priority number wins when two rules match', () => {
    const matches = evaluateShippingRules([
      { ...assignCarrierRule, id: 'slow', name: 'Slow rule', priority: 100, actions: [{ type: 'assignCarrier', value: 'slow' }] },
      { ...assignCarrierRule, id: 'fast', name: 'Fast rule', priority: 1, actions: [{ type: 'assignCarrier', value: 'fast' }] }
    ], { destinationCountry: 'NG', weightKg: 2 });

    expect(matches).toHaveLength(1);
    expect(matches[0].rule.id).toBe('fast');
    expect(matches[0].actions[0].value).toBe('fast');
  });

  it('blockBooking returns HTTP 422 with the rule name', async () => {
    const app = Fastify();
    apps.push(app);
    const blockRule = {
      ...assignCarrierRule,
      id: 'rule-block',
      name: 'No restricted goods',
      actions: [{ type: 'blockBooking', value: 'Restricted route' }]
    };
    const prisma = {
      shippingRule: {
        findMany: vi.fn(async ({ where }: any) => (where.tenantId === 'tenant-a' ? [blockRule] : []))
      }
    };
    (app as any).decorate('prisma', prisma);
    (app as any).decorate('authenticate', async (request: any) => {
      request.user = { sub: 'user-a', role: 'TENANT_ADMIN', tenantId: 'tenant-a' };
    });
    app.addHook('onRequest', (request, _reply, done) => {
      (request as any).tenant = { id: 'tenant-a', slug: 'tenant-a', name: 'Tenant A', plan: 'PRO' };
      done();
    });
    await registerShipmentRoutes(app as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/shipments',
      payload: {
        originAddress: { country: 'GB' },
        destinationAddress: { country: 'NG' },
        items: [{ weightKg: 1 }]
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: 'BOOKING_BLOCKED',
      rule: 'No restricted goods',
      reason: 'Restricted route'
    });
  });

  it('dry-run returns matched rules without mutating records', async () => {
    const { app, prisma } = await buildRulesRouteApp();
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenant/shipping-rules/rule-assign/test',
      payload: {
        shipment: {
          destinationAddress: { country: 'NG' },
          originAddress: { country: 'GB' },
          items: [{ weightKg: 3 }]
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      dryRun: true,
      matched: true,
      matchedRules: [
        expect.objectContaining({
          id: 'rule-assign',
          actions: [{ type: 'assignCarrier', value: 'carrier-ng-light' }]
        })
      ]
    });
    expect(prisma.shippingRule.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('inactive rules never fire', () => {
    const matches = evaluateShippingRules([{ ...assignCarrierRule, isActive: false }], {
      destinationCountry: 'NG',
      weightKg: 2
    });

    expect(matches).toEqual([]);
  });

  it('tenant A rules do not affect tenant B shipments', async () => {
    const prisma = {
      shippingRule: {
        findMany: vi.fn(async ({ where }: any) => (where.tenantId === 'tenant-a' ? [assignCarrierRule] : []))
      }
    };

    const match = await shippingRulesService.evaluateForBooking(prisma as any, 'tenant-b', {
      destinationAddress: { country: 'NG' },
      originAddress: { country: 'GB' },
      items: [{ weightKg: 2 }]
    });

    expect(match).toBeNull();
    expect(prisma.shippingRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-b', isActive: true }
    }));
  });
});
