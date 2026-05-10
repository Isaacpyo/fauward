import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const labelGenerateMock = vi.hoisted(() => vi.fn(async () => ({ id: 'label-1', url: 'file:///reverse-label.pdf' })));
const createTrackingEventMock = vi.hoisted(() => vi.fn(async () => undefined));
const notifyMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../documents/label.service.js', () => ({
  labelService: {
    generate: labelGenerateMock
  }
}));

vi.mock('../tracking/tracking-event.service.js', () => ({
  createTrackingEvent: createTrackingEventMock,
  buildStatusTitle: vi.fn((status: string) => status),
  statusToEventType: vi.fn((status: string) => status)
}));

vi.mock('../notifications/notifications.routes.js', () => ({
  createInAppNotifications: notifyMock
}));

import { registerReturnsRoutes } from './returns.routes.js';
import { returnsService } from './returns.service.js';

function buildApp() {
  const returns: any[] = [];
  const shipment = {
    id: 'ship-1',
    tenantId: 'tenant-a',
    trackingNumber: 'FW-R-1',
    customerId: 'customer-1',
    organisationId: null,
    carrierAccountId: 'carrier-1',
    createdAt: new Date('2026-05-02T10:00:00.000Z'),
    items: [{ id: 'item-1' }, { id: 'item-2' }]
  };
  const prisma = {
    shipment: {
      findFirst: vi.fn(async ({ where }: any) => (where.id === shipment.id && where.tenantId === shipment.tenantId ? shipment : null))
    },
    returnRequest: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `return-${returns.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        returns.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where, include, select }: any) => {
        const row = returns.find((item) => {
          if (where.id && item.id !== where.id) return false;
          if (where.tenantId && item.tenantId !== where.tenantId) return false;
          return true;
        });
        if (!row) return null;
        if (select) {
          return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
        }
        return include?.shipment ? { ...row, shipment } : row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = returns.find((item) => item.id === where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
      findMany: vi.fn(async ({ where, include }: any) => returns
        .filter((item) => {
          if (item.tenantId !== where.tenantId) return false;
          if (where.createdAt?.gte && item.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lte && item.createdAt > where.createdAt.lte) return false;
          return true;
        })
        .map((item) => include?.shipment ? { ...item, shipment } : item))
    }
  };
  const app = Fastify();
  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (request: any) => {
    request.user = { sub: 'user-a', role: 'TENANT_ADMIN', tenantId: 'tenant-a' };
  });
  app.addHook('onRequest', (request, _reply, done) => {
    (request as any).tenant = { id: 'tenant-a', slug: 'tenant-a', plan: 'PRO' };
    done();
  });
  return { app, prisma, returns, shipment };
}

describe('returns service', () => {
  const apps: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('creates return with items belonging to original shipment', async () => {
    const ctx = buildApp();
    apps.push(ctx.app);

    const created = await returnsService.create(ctx.app as any, 'tenant-a', {
      shipmentId: 'ship-1',
      reason: 'DAMAGED',
      items: [{ shipmentItemId: 'item-1', quantity: 1, description: 'Damaged charger' }]
    });

    expect(created).toEqual(expect.objectContaining({
      shipmentId: 'ship-1',
      status: 'REQUESTED',
      refundStatus: 'PENDING'
    }));
  });

  it('returns 422 when return items are not in the original shipment', async () => {
    const ctx = buildApp();
    apps.push(ctx.app);

    await expect(returnsService.create(ctx.app as any, 'tenant-a', {
      shipmentId: 'ship-1',
      reason: 'DAMAGED',
      items: [{ shipmentItemId: 'other-item', quantity: 1 }]
    })).rejects.toMatchObject({ statusCode: 422 });
  });

  it('approve generates reverse label and creates RETURN_INITIATED tracking metadata', async () => {
    const ctx = buildApp();
    apps.push(ctx.app);
    const created = await returnsService.create(ctx.app as any, 'tenant-a', { shipmentId: 'ship-1', reason: 'DAMAGED' });

    const approved = await returnsService.approve(ctx.app as any, 'tenant-a', created.id, 'user-a');

    expect(labelGenerateMock).toHaveBeenCalledWith(expect.anything(), 'tenant-a', 'ship-1', 'PDF', true);
    expect(approved).toEqual(expect.objectContaining({ status: 'APPROVED', labelId: 'label-1' }));
    expect(createTrackingEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      metadata: { returnEvent: 'RETURN_INITIATED' }
    }));
  });

  it('reject sets status REJECTED and does not generate label', async () => {
    const ctx = buildApp();
    apps.push(ctx.app);
    const created = await returnsService.create(ctx.app as any, 'tenant-a', { shipmentId: 'ship-1', reason: 'OTHER' });

    const rejected = await returnsService.reject(ctx.app as any, 'tenant-a', created.id, 'Out of window', 'user-a');

    expect(rejected).toEqual(expect.objectContaining({ status: 'REJECTED' }));
    expect(labelGenerateMock).not.toHaveBeenCalled();
  });

  it('receiveAtHub creates RETURN_RECEIVED tracking metadata', async () => {
    const ctx = buildApp();
    apps.push(ctx.app);
    const created = await returnsService.create(ctx.app as any, 'tenant-a', { shipmentId: 'ship-1', reason: 'OTHER' });

    const received = await returnsService.receiveAtHub(ctx.app as any, 'tenant-a', created.id);

    expect(received).toEqual(expect.objectContaining({ status: 'RECEIVED', refundStatus: 'APPROVED' }));
    expect(createTrackingEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      metadata: { returnEvent: 'RETURN_RECEIVED' }
    }));
  });

  it('analytics with groupBy=week returns period buckets and reason totals', async () => {
    const ctx = buildApp();
    apps.push(ctx.app);
    ctx.returns.push(
      { id: 'return-1', tenantId: 'tenant-a', shipmentId: 'ship-1', reason: 'DAMAGED', createdAt: new Date('2026-04-28T09:00:00.000Z') },
      { id: 'return-2', tenantId: 'tenant-a', shipmentId: 'ship-1', reason: 'DAMAGED', createdAt: new Date('2026-04-30T09:00:00.000Z') },
      { id: 'return-3', tenantId: 'tenant-a', shipmentId: 'ship-1', reason: 'OTHER', createdAt: new Date('2026-05-05T09:00:00.000Z') }
    );

    const analytics = await returnsService.analytics(ctx.app as any, 'tenant-a', {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.999Z',
      groupBy: 'week'
    });

    expect(analytics.periods).toEqual([
      expect.objectContaining({ period: '2026-04-27', total: 2, byReason: { DAMAGED: 2 } }),
      expect.objectContaining({ period: '2026-05-04', total: 1, byReason: { OTHER: 1 } })
    ]);
    expect(analytics.totals.byReason).toEqual({ DAMAGED: 2, OTHER: 1 });
  });

  it('analytics applies from/to filters', async () => {
    const ctx = buildApp();
    apps.push(ctx.app);
    ctx.returns.push(
      { id: 'return-old', tenantId: 'tenant-a', shipmentId: 'ship-1', reason: 'OLD', createdAt: new Date('2026-03-15T09:00:00.000Z') },
      { id: 'return-in-range', tenantId: 'tenant-a', shipmentId: 'ship-1', reason: 'DAMAGED', createdAt: new Date('2026-04-10T09:00:00.000Z') }
    );

    const analytics = await returnsService.analytics(ctx.app as any, 'tenant-a', {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T23:59:59.999Z',
      groupBy: 'month'
    });

    expect(analytics.totals.total).toBe(1);
    expect(analytics.totals.byReason).toEqual({ DAMAGED: 1 });
  });

  it('analytics groups by carrier when carrier is set on shipment', async () => {
    const ctx = buildApp();
    apps.push(ctx.app);
    ctx.returns.push(
      { id: 'return-carrier-1', tenantId: 'tenant-a', shipmentId: 'ship-1', reason: 'DAMAGED', createdAt: new Date('2026-04-10T09:00:00.000Z') },
      { id: 'return-carrier-2', tenantId: 'tenant-a', shipmentId: 'ship-1', reason: 'OTHER', createdAt: new Date('2026-04-11T09:00:00.000Z') }
    );

    const analytics = await returnsService.analytics(ctx.app as any, 'tenant-a', {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T23:59:59.999Z',
      groupBy: 'day'
    });

    expect(analytics.totals.byCarrier).toEqual({ 'carrier-1': 2 });
  });

  it('public status endpoint is accessible without bearer auth using token', async () => {
    const ctx = buildApp();
    apps.push(ctx.app);
    ctx.returns.push({
      id: 'return-public',
      tenantId: 'tenant-a',
      status: 'REQUESTED',
      reason: 'DAMAGED',
      returnLabel: null,
      updatedAt: new Date()
    });
    await registerReturnsRoutes(ctx.app as any);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/customer/returns/return-public/status?token=return-public'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      id: 'return-public',
      status: 'REQUESTED'
    }));
  });
});
