import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Mock middleware to bypass auth/role checks during route tests ────────────
vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: vi.fn(async () => {})
}));
vi.mock('../../shared/middleware/requireRole.js', () => ({
  requireRole: vi.fn(() => async () => {})
}));

// Spy on notifier so we can assert manager fan-out without mocking individual deps.
vi.mock('./notifier.js', () => ({
  notifyManagersOfRequest: vi.fn(async () => {}),
  notifyRequester: vi.fn(async () => {})
}));

import { registerShipmentPermissionRoutes } from './routes.js';
import { notifyManagersOfRequest, notifyRequester } from './notifier.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant-1';
const REQUESTER_USER_ID = 'user-driver-b';
const REQUESTER_DRIVER_ID = 'driver-b';
const APPROVER_ID = 'user-mgr-1';

const SHIPMENT_FIXTURE = {
  id: 'ship-1',
  trackingNumber: 'FW-ABC-001',
  status: 'OUT_FOR_DELIVERY',
  assignedDriverId: 'driver-a',
  destinationAddress: { name: 'Jane Doe', line1: '1 High St', city: 'London' },
  driver: {
    id: 'driver-a',
    userId: 'user-driver-a',
    user: { firstName: 'Alice', lastName: 'Driver', email: 'a@example.com' }
  },
  routeStops: [
    { id: 'stop-1', sequence: 1, type: 'DELIVERY', completedAt: null }
  ]
};

// ── App builder ──────────────────────────────────────────────────────────────
function buildApp(opts: {
  user?: { sub: string; role: string };
  shipment?: typeof SHIPMENT_FIXTURE | null;
  myDriverId?: string | null;
  existingPending?: { id: string } | null;
  requestRow?: any;
  approveTxRequester?: { id: string } | null;
} = {}) {
  const user = opts.user ?? { sub: REQUESTER_USER_ID, role: 'TENANT_DRIVER' };

  const requestStore: any[] = [];

  const prisma: any = {
    shipment: {
      findFirst: vi.fn().mockResolvedValue(opts.shipment === null ? null : opts.shipment ?? SHIPMENT_FIXTURE),
      update: vi.fn(async ({ data }: any) => ({ ...(opts.shipment ?? SHIPMENT_FIXTURE), ...data })),
      findUnique: vi.fn(async () => ({ trackingNumber: SHIPMENT_FIXTURE.trackingNumber }))
    },
    driver: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where?.userId === REQUESTER_USER_ID && opts.myDriverId !== null) {
          return { id: opts.myDriverId ?? REQUESTER_DRIVER_ID };
        }
        return null;
      })
    },
    user: {
      findFirst: vi.fn(async () => ({ firstName: 'Bob', lastName: 'Driver', email: 'b@example.com' })),
      findMany: vi.fn(async () => [
        { id: APPROVER_ID, firstName: 'Mae', lastName: 'Manager', email: 'm@example.com', role: 'TENANT_MANAGER' }
      ])
    },
    shipmentPermissionRequest: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where?.status === 'PENDING' && where?.requestedByUserId) {
          return opts.existingPending ?? null;
        }
        return opts.requestRow ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 'req-1', status: data.status, createdAt: new Date() };
        requestStore.push(row);
        return row;
      }),
      update: vi.fn(async ({ data, select }: any) => {
        const row = { id: 'req-1', status: data.status, respondedAt: new Date() };
        return select ? row : row;
      }),
      findMany: vi.fn(async () => [])
    },
    shipmentEvent: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (cb: any) => {
      // Pass the same prisma mock as the transactional client.
      return cb(prisma);
    })
  };

  const app = Fastify({ logger: false });

  app.addHook('onRequest', (req: any, _reply, done) => {
    req.tenant = { id: TENANT_ID, slug: 'acme', plan: 'PRO' };
    req.user = user;
    done();
  });

  return { app, prisma, user };
}

async function setup(opts?: Parameters<typeof buildApp>[0]) {
  const ctx = buildApp(opts);
  await ctx.app.register(sensible);
  await registerShipmentPermissionRoutes(ctx.app as any);
  Object.assign(ctx.app, { prisma: ctx.prisma });
  // The route handlers reference `app.prisma`; decorate after sensible registration
  // so the prisma getter is in place when routes execute.
  (ctx.app as any).prisma = ctx.prisma;
  return ctx;
}

const openApps: any[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  while (openApps.length) {
    const a = openApps.pop();
    await a.close();
  }
});

// ── POST /api/v1/field/scan/lookup ───────────────────────────────────────────
describe('POST /api/v1/field/scan/lookup', () => {
  it('returns shipment summary with isAssignedToMe=false for another driver\'s shipment', async () => {
    const ctx = await setup();
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/field/scan/lookup',
      payload: { trackingNumber: 'fw-abc-001' },
      headers: { Authorization: 'Bearer x' }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.shipment.trackingNumber).toBe('FW-ABC-001');
    expect(body.shipment.status).toBe('OUT_FOR_DELIVERY');
    expect(body.shipment.recipientName).toBe('Jane Doe');
    expect(body.shipment.assignedDriver).toEqual({ id: 'driver-a', name: 'Alice Driver' });
    expect(body.shipment.isAssignedToMe).toBe(false);
    expect(body.shipment.currentStop).toEqual({ id: 'stop-1', sequence: 1, type: 'DELIVERY' });
  });

  it('returns isAssignedToMe=true when shipment is assigned to the requesting driver', async () => {
    const ctx = await setup({
      shipment: { ...SHIPMENT_FIXTURE, assignedDriverId: REQUESTER_DRIVER_ID }
    });
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/field/scan/lookup',
      payload: { trackingNumber: 'FW-ABC-001' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().shipment.isAssignedToMe).toBe(true);
  });

  it('returns 404 when the tracking number is not in the tenant', async () => {
    const ctx = await setup({ shipment: null });
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/field/scan/lookup',
      payload: { trackingNumber: 'NOPE' }
    });

    expect(res.statusCode).toBe(404);
  });

  it('scopes lookup query by tenantId', async () => {
    const ctx = await setup();
    openApps.push(ctx.app);

    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/field/scan/lookup',
      payload: { trackingNumber: 'FW-ABC-001' }
    });

    expect(ctx.prisma.shipment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, trackingNumber: 'FW-ABC-001' }
      })
    );
  });
});

// ── POST /api/v1/field/permission-requests ───────────────────────────────────
describe('POST /api/v1/field/permission-requests', () => {
  it('creates a PENDING request and notifies managers', async () => {
    const ctx = await setup();
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/field/permission-requests',
      payload: { shipmentId: 'ship-1', note: 'I am at the warehouse now' }
    });

    expect(res.statusCode).toBe(201);
    expect(ctx.prisma.shipmentPermissionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          shipmentId: 'ship-1',
          requestedByUserId: REQUESTER_USER_ID,
          requestedAction: 'reassign_driver',
          status: 'PENDING',
          note: 'I am at the warehouse now'
        })
      })
    );
    expect(notifyManagersOfRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects creation when the shipment is already assigned to the requester', async () => {
    const ctx = await setup({
      shipment: { ...SHIPMENT_FIXTURE, assignedDriverId: REQUESTER_DRIVER_ID }
    });
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/field/permission-requests',
      payload: { shipmentId: 'ship-1' }
    });

    expect(res.statusCode).toBe(409);
    expect(ctx.prisma.shipmentPermissionRequest.create).not.toHaveBeenCalled();
    expect(notifyManagersOfRequest).not.toHaveBeenCalled();
  });

  it('rejects duplicate pending requests from the same user', async () => {
    const ctx = await setup({ existingPending: { id: 'req-existing' } });
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/field/permission-requests',
      payload: { shipmentId: 'ship-1' }
    });

    expect(res.statusCode).toBe(409);
    expect(ctx.prisma.shipmentPermissionRequest.create).not.toHaveBeenCalled();
  });

  it('rejects requesters who are not registered drivers', async () => {
    const ctx = await setup({ myDriverId: null });
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/field/permission-requests',
      payload: { shipmentId: 'ship-1' }
    });

    expect(res.statusCode).toBe(403);
  });
});

// ── POST /api/v1/permission-requests/:id/approve ─────────────────────────────
describe('POST /api/v1/permission-requests/:id/approve', () => {
  function approverApp() {
    return setup({
      user: { sub: APPROVER_ID, role: 'TENANT_MANAGER' },
      requestRow: { id: 'req-1', status: 'PENDING', shipmentId: 'ship-1', requestedByUserId: REQUESTER_USER_ID }
    });
  }

  it('reassigns the shipment, marks request APPROVED, writes a ShipmentEvent, notifies requester', async () => {
    const ctx = await approverApp();
    openApps.push(ctx.app);
    // requester driver lookup
    ctx.prisma.driver.findFirst = vi.fn(async () => ({ id: REQUESTER_DRIVER_ID }));

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/permission-requests/req-1/approve'
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.shipment.update).toHaveBeenCalledWith({
      where: { id: 'ship-1' },
      data: { assignedDriverId: REQUESTER_DRIVER_ID }
    });
    expect(ctx.prisma.shipmentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shipmentId: 'ship-1',
          status: 'DRIVER_REASSIGNED',
          actorId: APPROVER_ID
        })
      })
    );
    expect(ctx.prisma.shipmentPermissionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'req-1' },
        data: expect.objectContaining({ status: 'APPROVED', respondedByUserId: APPROVER_ID })
      })
    );
    expect(notifyRequester).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decision: 'APPROVED', requesterUserId: REQUESTER_USER_ID })
    );
  });

  it('returns 409 if the request is not pending', async () => {
    const ctx = await setup({
      user: { sub: APPROVER_ID, role: 'TENANT_MANAGER' },
      requestRow: { id: 'req-1', status: 'APPROVED', shipmentId: 'ship-1', requestedByUserId: REQUESTER_USER_ID }
    });
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/permission-requests/req-1/approve'
    });

    expect(res.statusCode).toBe(409);
    expect(ctx.prisma.shipment.update).not.toHaveBeenCalled();
  });

  it('returns 422 when the requester no longer has a driver record', async () => {
    const ctx = await approverApp();
    openApps.push(ctx.app);
    ctx.prisma.driver.findFirst = vi.fn(async () => null);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/permission-requests/req-1/approve'
    });

    expect(res.statusCode).toBe(422);
    expect(ctx.prisma.shipment.update).not.toHaveBeenCalled();
  });
});

// ── POST /api/v1/permission-requests/:id/reject ──────────────────────────────
describe('POST /api/v1/permission-requests/:id/reject', () => {
  it('marks request REJECTED, leaves shipment untouched, notifies requester', async () => {
    const ctx = await setup({
      user: { sub: APPROVER_ID, role: 'TENANT_MANAGER' },
      requestRow: { id: 'req-1', status: 'PENDING', shipmentId: 'ship-1', requestedByUserId: REQUESTER_USER_ID }
    });
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/permission-requests/req-1/reject',
      payload: { reason: 'Wrong warehouse' }
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.shipment.update).not.toHaveBeenCalled();
    expect(ctx.prisma.shipmentPermissionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED' })
      })
    );
    expect(notifyRequester).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decision: 'REJECTED', reason: 'Wrong warehouse' })
    );
  });
});

// ── POST /api/v1/permission-requests/:id/cancel ──────────────────────────────
describe('POST /api/v1/permission-requests/:id/cancel', () => {
  it('lets the requester cancel their own pending request', async () => {
    const ctx = await setup({
      requestRow: { id: 'req-1', status: 'PENDING', requestedByUserId: REQUESTER_USER_ID }
    });
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/permission-requests/req-1/cancel'
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.shipmentPermissionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) })
    );
  });

  it('forbids another user from cancelling someone else\'s request', async () => {
    const ctx = await setup({
      user: { sub: 'other-user', role: 'TENANT_DRIVER' },
      requestRow: { id: 'req-1', status: 'PENDING', requestedByUserId: REQUESTER_USER_ID }
    });
    openApps.push(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/permission-requests/req-1/cancel'
    });

    expect(res.statusCode).toBe(403);
  });
});
