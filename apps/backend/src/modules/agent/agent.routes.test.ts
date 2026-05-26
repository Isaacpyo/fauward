import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = req.user ?? { sub: 'user-staff-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
  })
}));
vi.mock('../../shared/middleware/requireRole.js', () => ({
  requireRole: vi.fn(() => async () => {})
}));

import { registerAgentRoutes } from './agent.routes.js';

function buildApp(tenantOverrides: Record<string, unknown> = {}) {
  const app = Fastify();

  const agentActions: Array<Record<string, unknown>> = [
    { id: 'action-1', tenantId: 'tenant-1', type: 'reroute_shipment', status: 'PENDING_APPROVAL', payload: { shipmentId: 'ship-1', newDriverId: 'drv-2', reason: 'delay' }, risk: 'requires_approval', createdAt: new Date('2026-05-25T10:00:00Z') },
    { id: 'action-2', tenantId: 'tenant-1', type: 'flag_sla_risk', status: 'AUTO_APPLIED', payload: { shipmentId: 'ship-2' }, risk: 'auto_approved', createdAt: new Date('2026-05-25T09:00:00Z') },
    { id: 'action-3', tenantId: 'tenant-2', type: 'reroute_shipment', status: 'PENDING_APPROVAL', payload: { shipmentId: 'ship-3', newDriverId: 'drv-3', reason: 'delay' }, risk: 'requires_approval', createdAt: new Date('2026-05-25T08:00:00Z') }
  ];

  const prisma = {
    agentAction: {
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return agentActions.filter((a) => {
          if (where.tenantId && a.tenantId !== where.tenantId) return false;
          if (where.status) {
            if (typeof where.status === 'string' && a.status !== where.status) return false;
            if (typeof where.status === 'object' && Array.isArray(where.status.in) && !where.status.in.includes(a.status)) return false;
          }
          return true;
        });
      }),
      count: vi.fn().mockImplementation(async ({ where }: any) => {
        return agentActions.filter((a) => {
          if (where.tenantId && a.tenantId !== where.tenantId) return false;
          if (where.status) {
            if (typeof where.status === 'string' && a.status !== where.status) return false;
            if (typeof where.status === 'object' && Array.isArray(where.status.in) && !where.status.in.includes(a.status)) return false;
          }
          return true;
        }).length;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        return agentActions.find((a) => {
          if (where.id && a.id !== where.id) return false;
          if (where.tenantId && a.tenantId !== where.tenantId) return false;
          return true;
        }) ?? null;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const action = agentActions.find((a) => a.id === where.id);
        if (!action) return null;
        Object.assign(action, data);
        return action;
      })
    },
    shipment: {
      findFirst: vi.fn().mockResolvedValue({ assignedDriverId: 'drv-1', status: 'IN_TRANSIT' }),
      count: vi.fn().mockResolvedValue(0)
    },
    aiAgentRun: {
      findFirst: vi.fn().mockResolvedValue(null)
    }
  };

  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (req: any) => {
    req.user = { sub: 'user-staff-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
  });
  app.addHook('onRequest', (req, _reply, done) => {
    (req as any).tenant = { id: 'tenant-1', slug: 'acme', plan: 'PRO', ...tenantOverrides };
    done();
  });

  return { app, prisma, agentActions };
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  while (apps.length) {
    const ctx = apps.pop();
    if (ctx) await ctx.app.close();
  }
  mockHandler.mockClear();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockHandler = vi.fn().mockResolvedValue({ shipmentId: 'ship-1', rerouted: true });
const mockHandlers = {
  reroute_shipment: mockHandler,
  flag_sla_risk: vi.fn().mockResolvedValue({ flagged: true }),
  send_customer_notification: vi.fn().mockResolvedValue({ queued: true })
};

vi.mock('./agent.handlers.impl.js', () => ({
  buildToolHandlers: vi.fn(() => mockHandlers)
}));

// ─── List ────────────────────────────────────────────────────────────────────

describe('GET /v1/agent/actions', () => {
  it('returns only pending actions for the caller tenant', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/actions?status=PENDING_APPROVAL',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('action-1');
    expect(body.total).toBe(1);
  });

  it('returns empty for a tenant with no pending actions', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/actions?status=FAILED',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('rejects when plan does not include agent feature', async () => {
    const ctx = buildApp({ plan: 'STARTER' });
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/actions',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(403);
  });
});

// ─── Approve ─────────────────────────────────────────────────────────────────

describe('POST /v1/agent/actions/:id/approve', () => {
  it('runs the handler once and flips status to APPLIED', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);
    mockHandler.mockClear();

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/actions/action-1/approve',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(mockHandler).toHaveBeenCalledTimes(1);

    const updated = ctx.agentActions.find((a) => a.id === 'action-1');
    expect(updated?.status).toBe('APPLIED');
    expect(updated?.approvedBy).toBe('user-staff-1');
    expect(updated?.appliedAt).toBeDefined();
  });

  it('double-approve is a guarded no-op', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);
    mockHandler.mockClear();

    // First approve
    const res1 = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/actions/action-1/approve',
      headers: { authorization: 'Bearer token' }
    });
    expect(res1.statusCode).toBe(200);

    // Second approve
    const res2 = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/actions/action-1/approve',
      headers: { authorization: 'Bearer token' }
    });
    expect(res2.statusCode).toBe(409);
    expect(JSON.parse(res2.payload).error).toContain('already');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it('cross-tenant action returns 404 (no leak)', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/actions/action-3/approve',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(404);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('handler error flips status to FAILED with error message', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);
    mockHandler.mockRejectedValueOnce(new Error('Driver offline'));

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/actions/action-1/approve',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('Driver offline');

    const updated = ctx.agentActions.find((a) => a.id === 'action-1');
    expect(updated?.status).toBe('FAILED');
    expect(updated?.approvedBy).toBe('user-staff-1');
  });
});

// ─── Reject ──────────────────────────────────────────────────────────────────

describe('POST /v1/agent/actions/:id/reject', () => {
  it('never runs the handler; status becomes REJECTED', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);
    mockHandler.mockClear();

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/actions/action-1/reject',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    expect(mockHandler).not.toHaveBeenCalled();

    const updated = ctx.agentActions.find((a) => a.id === 'action-1');
    expect(updated?.status).toBe('REJECTED');
    expect(updated?.approvedBy).toBe('user-staff-1');
  });

  it('cross-tenant action returns 404', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/actions/action-3/reject',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(404);
  });

  it('rejecting already-rejected action is a no-op error', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentRoutes(ctx.app);

    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/actions/action-1/reject',
      headers: { authorization: 'Bearer token' }
    });

    const res2 = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/actions/action-1/reject',
      headers: { authorization: 'Bearer token' }
    });

    expect(res2.statusCode).toBe(409);
    expect(JSON.parse(res2.payload).error).toContain('already');
  });
});

// ─── Coverage ───────────────────────────────────────────────────────────────

describe('GET /api/v1/agent/coverage', () => {
  it('returns groups (problems-first), omits empty kinds, computes onTrack', async () => {
    const ctx = buildApp();
    apps.push(ctx);

    const latestRun = { id: 'run-latest', createdAt: new Date('2026-05-26T08:00:00Z') };
    ctx.prisma.aiAgentRun.findFirst.mockResolvedValueOnce(latestRun);

    // 200 non-terminal shipments, 3 of them flagged → onTrack = 197.
    ctx.prisma.shipment.count.mockResolvedValueOnce(200);

    // First findMany call inside coverage = PENDING_APPROVAL.
    ctx.prisma.agentAction.findMany.mockResolvedValueOnce([
      {
        id: 'pa-1', tenantId: 'tenant-1', type: 'assign_shipment',
        status: 'PENDING_APPROVAL',
        payload: { shipmentId: 'ship-a', findingKind: 'unassigned' },
        risk: 'requires_approval', createdAt: new Date()
      },
      {
        id: 'pa-2', tenantId: 'tenant-1', type: 'send_customer_notification',
        status: 'PENDING_APPROVAL',
        payload: { shipmentId: 'ship-b', findingKind: 'failed_unhandled' },
        risk: 'requires_approval', createdAt: new Date()
      }
    ]);

    // Second findMany call = flag_findings for the latest run.
    ctx.prisma.agentAction.findMany.mockResolvedValueOnce([
      {
        id: 'fa-1', tenantId: 'tenant-1', type: 'flag_finding',
        status: 'AUTO_APPLIED',
        payload: { kind: 'overloaded_driver', driverName: 'Ade', activeJobCount: 12 },
        risk: 'auto_approved', createdAt: new Date()
      },
      {
        id: 'fa-2', tenantId: 'tenant-1', type: 'flag_finding',
        status: 'AUTO_APPLIED',
        payload: { kind: 'unassigned', shipmentId: 'ship-a', trackingNumber: 'TR-A' },
        risk: 'auto_approved', createdAt: new Date()
      },
      {
        id: 'fa-3', tenantId: 'tenant-1', type: 'flag_finding',
        status: 'AUTO_APPLIED',
        payload: { kind: 'failed_unhandled', shipmentId: 'ship-b', trackingNumber: 'TR-B' },
        risk: 'auto_approved', createdAt: new Date()
      },
      {
        id: 'fa-4', tenantId: 'tenant-1', type: 'flag_finding',
        status: 'AUTO_APPLIED',
        payload: { kind: 'at_risk_soon', shipmentId: 'ship-c', trackingNumber: 'TR-C' },
        risk: 'auto_approved', createdAt: new Date()
      }
    ]);

    await registerAgentRoutes(ctx.app);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/coverage',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    // Order is problems-first.
    expect(body.groups.map((g: { kind: string }) => g.kind)).toEqual([
      'unassigned', 'failed_unhandled', 'at_risk_soon', 'overloaded_driver'
    ]);
    // past_deadline + stuck had zero items → omitted.
    expect(body.groups.find((g: { kind: string }) => g.kind === 'past_deadline')).toBeUndefined();
    expect(body.groups.find((g: { kind: string }) => g.kind === 'stuck')).toBeUndefined();

    // Unassigned group bundles the PENDING proposal AND the flag_finding for the same shipment.
    const unassigned = body.groups.find((g: { kind: string }) => g.kind === 'unassigned');
    expect(unassigned.actionable).toBe(true);
    expect(unassigned.items).toHaveLength(2);

    // Overloaded driver = informational only.
    const overloaded = body.groups.find((g: { kind: string }) => g.kind === 'overloaded_driver');
    expect(overloaded.actionable).toBe(false);
    expect(overloaded.items).toHaveLength(1);

    // 3 distinct flagged shipmentIds (ship-a, ship-b, ship-c) → onTrack = 200 - 3 = 197.
    expect(body.onTrack).toBe(197);
    expect(body.lastRunAt).toBe(latestRun.createdAt.toISOString());
  });

  it('returns empty groups + onTrack=0 + lastRunAt=null when the tenant has never run a sweep', async () => {
    const ctx = buildApp();
    apps.push(ctx);

    ctx.prisma.aiAgentRun.findFirst.mockResolvedValueOnce(null);
    ctx.prisma.shipment.count.mockResolvedValueOnce(0);
    ctx.prisma.agentAction.findMany.mockResolvedValueOnce([]); // PENDING_APPROVAL

    await registerAgentRoutes(ctx.app);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/coverage',
      headers: { authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.groups).toEqual([]);
    expect(body.onTrack).toBe(0);
    expect(body.lastRunAt).toBeNull();
  });

  it('tenant isolation: queries are scoped to the caller tenant', async () => {
    const ctx = buildApp();
    apps.push(ctx);

    ctx.prisma.aiAgentRun.findFirst.mockResolvedValueOnce(null);
    ctx.prisma.shipment.count.mockResolvedValueOnce(0);
    ctx.prisma.agentAction.findMany.mockResolvedValueOnce([]);

    await registerAgentRoutes(ctx.app);
    await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/coverage',
      headers: { authorization: 'Bearer token' }
    });

    expect(ctx.prisma.aiAgentRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) })
    );
    expect(ctx.prisma.shipment.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) })
    );
    for (const call of ctx.prisma.agentAction.findMany.mock.calls) {
      expect(call[0].where.tenantId).toBe('tenant-1');
    }
  });
});
