import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ACC-TP-1 (WP-2.0 + WP-2.1): a shipment created from the tenant wizard writes the row, increments this month's usage
// and emits an outbox event carrying tenantId, which the outbox worker projects into one console activity row.

vi.mock('../../queues/python-services.js', () => ({ publishPythonServiceJob: vi.fn(async () => undefined) }));
vi.mock('../tracking/tracking-event.service.js', () => ({
  createTrackingEvent: vi.fn(async () => undefined),
  buildStatusTitle: vi.fn((status: string) => status),
  statusToEventType: vi.fn((status: string) => status)
}));
vi.mock('../../shared/utils/pricing.js', () => ({
  calculateShipmentPrice: vi.fn(async () => ({ total: 12.5, currency: 'GBP', breakdown: [], chargeableWeightKg: 4 }))
}));
vi.mock('../../shared/utils/trackingNumber.js', () => ({ generateTrackingNumber: vi.fn(async () => 'NWD-2026-000042') }));
vi.mock('../../queues/queues.js', () => ({
  notificationQueue: { add: vi.fn(async () => undefined) },
  webhookQueue: { add: vi.fn(async () => undefined) },
  outboxQueue: { add: vi.fn(async () => undefined) },
  analyticsQueue: { add: vi.fn(async () => undefined) },
  bullmqConnection: {}
}));
vi.mock('bullmq', () => ({ Queue: class { add = vi.fn(); close = vi.fn(async () => undefined); } }));

import { registerShipmentRoutes } from './shipments.routes.js';

const apps: Array<{ close: () => Promise<unknown> }> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()?.close();
});

describe('shipment create → usage + outbox + activity (ACC-TP-1)', () => {
  it('ACC-TP-1 POST /v1/shipments creates the row, increments usage once and projects one shipment.created activity', async () => {
    const outbox: Array<Record<string, unknown>> = [];
    const usage: Array<Record<string, unknown>> = [];
    const tx = {
      shipment: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ship_1', estimatedDelivery: null, ...data })), update: vi.fn() },
      shipmentItem: { createMany: vi.fn(async () => ({ count: 1 })) },
      shipmentEvent: { create: vi.fn(async () => ({})) },
      trackingEvent: { create: vi.fn(async () => ({ id: 'trk_1', occurredAt: new Date() })) },
      trackingSnapshot: { create: vi.fn(async () => ({})) },
      usageRecord: { upsert: vi.fn(async (args: Record<string, unknown>) => { usage.push(args); return {}; }) },
      outboxEvent: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { outbox.push(data); return { id: 'obx_1', ...data }; }) },
      auditLog: { create: vi.fn(async () => ({})) },
      payment: { findFirst: vi.fn(async () => null), update: vi.fn(), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'pay_1', ...data })) }
    };
    const app = Fastify();
    apps.push(app);
    app.decorate('prisma', {
      shippingRule: { findMany: vi.fn(async () => []) },
      user: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);
    app.decorate('authenticate', async (request: { user?: unknown }) => {
      request.user = { sub: 'user_a', role: 'TENANT_ADMIN', tenantId: 'tenant_a' };
    });
    app.addHook('onRequest', (request, _reply, done) => {
      (request as { tenant?: unknown }).tenant = { id: 'tenant_a', slug: 'northwind', name: 'Northwind', plan: 'PRO' };
      done();
    });
    await registerShipmentRoutes(app as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/shipments',
      payload: {
        originAddress: { line1: '1 Dock Road', city: 'Lagos', country: 'NG', contactName: 'Ada', contactPhone: '+234' },
        destinationAddress: { line1: '9 High Street', city: 'Abuja', country: 'NG', contactName: 'Bola', contactPhone: '+234' },
        serviceTier: 'STANDARD',
        items: [{ quantity: 2, weightKg: 4 }]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: 'ship_1', trackingNumber: 'NWD-2026-000042' });
    expect(tx.shipment.create.mock.calls[0][0].data).toMatchObject({ tenantId: 'tenant_a', trackingNumber: 'NWD-2026-000042', serviceTier: 'STANDARD' });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ update: { shipments: { increment: 1 } }, create: { tenantId: 'tenant_a', shipments: 1 } });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ tenantId: 'tenant_a', eventType: 'shipment.created', aggregateId: 'ship_1' });

    const { activityForOutboxEvent } = await import('../../services/outbox-activity-map.js');
    const activity = activityForOutboxEvent({ id: 'obx_1', createdAt: new Date(), ...(outbox[0] as { eventType: string; aggregateId: string; tenantId: string; payload: never }) });
    expect(activity).toMatchObject({
      service: 'customer.360',
      type: 'shipment.created',
      tenantId: 'tenant_a',
      subjectId: 'ship_1',
      dedupeKey: 'outbox:obx_1',
      summary: 'Shipment NWD-2026-000042 created'
    });
  });

  it('routine status hops are not projected; exceptions are, as ATTENTION', async () => {
    const { activityForOutboxEvent } = await import('../../services/outbox-activity-map.js');
    const base = { id: 'obx_2', aggregateId: 'ship_1', tenantId: 'tenant_a', createdAt: new Date(), eventType: 'shipment.status.updated' };
    expect(activityForOutboxEvent({ ...base, payload: { status: 'IN_TRANSIT', trackingNumber: 'NWD-1' } })).toBeNull();
    expect(activityForOutboxEvent({ ...base, payload: { status: 'EXCEPTION', trackingNumber: 'NWD-1' } })).toMatchObject({ type: 'shipment.attention', severity: 'ATTENTION' });
    expect(activityForOutboxEvent({ ...base, eventType: 'tenant.verification_email.requested', payload: {} })).toBeNull();
  });
});
