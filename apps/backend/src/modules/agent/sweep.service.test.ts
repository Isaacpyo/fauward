import { describe, expect, it, vi, beforeEach } from 'vitest';

import { runSweep } from './sweep.service.js';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

type CreateCall = { data: Record<string, unknown> };

function buildApp(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    aiAgentRun: { update: vi.fn().mockResolvedValue({}) },
    agentAction: { create: vi.fn().mockResolvedValue({ id: 'agentaction-1' }) },
    shipment: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([])
    },
    driver: { findMany: vi.fn().mockResolvedValue([]) },
    exceptionCase: { findMany: vi.fn().mockResolvedValue([]) },
    ...prismaOverrides
  };
  const app = {
    prisma,
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
  } as any;
  return { app, prisma };
}

function agentActionCreates(prisma: any): CreateCall[] {
  return (prisma.agentAction.create as ReturnType<typeof vi.fn>).mock.calls.map(([arg]) => arg);
}

function findCreate(prisma: any, predicate: (data: Record<string, unknown>) => boolean) {
  return agentActionCreates(prisma).find((c) => predicate(c.data));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runSweep', () => {
  it('empty sweep: marks COMPLETED with zero counts and writes no AgentAction rows', async () => {
    const { app, prisma } = buildApp();

    await runSweep(app, 'run-empty', TENANT_A);

    expect(prisma.agentAction.create).not.toHaveBeenCalled();
    const updates = (prisma.aiAgentRun.update as ReturnType<typeof vi.fn>).mock.calls;
    const last = updates[updates.length - 1][0];
    expect(last.data.status).toBe('COMPLETED');
    expect(last.data.stage).toBe('complete');
    expect(last.data.finishedAt).toBeInstanceOf(Date);
  });

  it('tenant isolation: every prisma call uses the sweep tenantId', async () => {
    const { app, prisma } = buildApp();

    await runSweep(app, 'run-iso', TENANT_A);

    for (const call of (prisma.shipment.findMany as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0].where.tenantId).toBe(TENANT_A);
    }
    for (const call of (prisma.driver.findMany as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0].where.tenantId).toBe(TENANT_A);
    }
    for (const call of (prisma.exceptionCase.findMany as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0].where.tenantId).toBe(TENANT_A);
    }
    expect((prisma.shipment.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where.tenantId).toBe(TENANT_A);
    expect(prisma.agentAction.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_B }) })
    );
  });

  it('writes a flag_finding for every finding, linked to the sweep run', async () => {
    const { app, prisma } = buildApp({
      shipment: {
        count: vi.fn().mockResolvedValue(10),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: 'ship-1', trackingNumber: 'TR-1', status: 'PENDING' }
          ])
          .mockResolvedValueOnce([]) // past_deadline
          .mockResolvedValueOnce([]) // failed_unhandled
          .mockResolvedValueOnce([]) // at_risk_soon
      }
      // no available drivers → no PENDING proposal for the unassigned finding
    });

    await runSweep(app, 'run-flag', TENANT_A);

    const flagWrites = agentActionCreates(prisma).filter((c) => c.data.type === 'flag_finding');
    expect(flagWrites).toHaveLength(1);
    expect(flagWrites[0].data.tenantId).toBe(TENANT_A);
    expect(flagWrites[0].data.runId).toBe('run-flag');
    expect(flagWrites[0].data.status).toBe('AUTO_APPLIED');
    expect(flagWrites[0].data.risk).toBe('auto_approved');
    expect(flagWrites[0].data.payload).toMatchObject({ kind: 'unassigned', shipmentId: 'ship-1' });
  });

  it('unassigned + available driver → writes PENDING_APPROVAL assign_shipment', async () => {
    const { app, prisma } = buildApp({
      shipment: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'ship-1', trackingNumber: 'TR-1', status: 'PENDING' }])
          .mockResolvedValueOnce([]) // past_deadline
          .mockResolvedValueOnce([]) // failed_unhandled
          .mockResolvedValueOnce([]) // at_risk_soon
      },
      driver: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'drv-busy',
            createdAt: new Date('2026-01-01'),
            user: { firstName: 'Busy', lastName: 'Driver', email: 'busy@x.com' },
            _count: { shipments: 7 }
          },
          {
            id: 'drv-light',
            createdAt: new Date('2026-01-02'),
            user: { firstName: 'Ade', lastName: 'Onifade', email: 'ade@x.com' },
            _count: { shipments: 2 }
          }
        ])
      }
    });

    await runSweep(app, 'run-assign', TENANT_A);

    const assignWrite = findCreate(prisma, (d) => d.type === 'assign_shipment');
    expect(assignWrite).toBeDefined();
    expect(assignWrite!.data.status).toBe('PENDING_APPROVAL');
    expect(assignWrite!.data.risk).toBe('requires_approval');
    expect(assignWrite!.data.tenantId).toBe(TENANT_A);
    expect(assignWrite!.data.runId).toBe('run-assign');
    expect(assignWrite!.data.payload).toMatchObject({
      shipmentId: 'ship-1',
      trackingNumber: 'TR-1',
      findingKind: 'unassigned',
      driverId: 'drv-light',
      tenantId: TENANT_A
    });
    expect(String((assignWrite!.data.payload as Record<string, unknown>).reason)).toContain('Ade Onifade');
  });

  it('unassigned + no available driver → no PENDING_APPROVAL row (flag-only)', async () => {
    const { app, prisma } = buildApp({
      shipment: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'ship-1', trackingNumber: 'TR-1', status: 'PENDING' }])
          .mockResolvedValueOnce([]) // past_deadline
          .mockResolvedValueOnce([]) // failed_unhandled
          .mockResolvedValueOnce([]) // at_risk_soon
      },
      driver: { findMany: vi.fn().mockResolvedValue([]) }
    });

    await runSweep(app, 'run-noassign', TENANT_A);

    const writes = agentActionCreates(prisma);
    expect(writes).toHaveLength(1);
    expect(writes[0].data.type).toBe('flag_finding');
    expect(writes.find((c) => c.data.status === 'PENDING_APPROVAL')).toBeUndefined();
  });

  it('failed_unhandled → writes PENDING_APPROVAL send_customer_notification (failed_delivery template)', async () => {
    const { app, prisma } = buildApp({
      shipment: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([]) // unassigned
          .mockResolvedValueOnce([]) // past_deadline
          .mockResolvedValueOnce([
            // failed_unhandled
            { id: 'ship-fail', trackingNumber: 'TR-FAIL', events: [{ timestamp: new Date() }] }
          ])
          .mockResolvedValueOnce([]) // at_risk_soon
      }
    });

    await runSweep(app, 'run-failed', TENANT_A);

    const notify = findCreate(prisma, (d) => d.type === 'send_customer_notification');
    expect(notify).toBeDefined();
    expect(notify!.data.status).toBe('PENDING_APPROVAL');
    expect(notify!.data.risk).toBe('requires_approval');
    expect(notify!.data.payload).toMatchObject({
      shipmentId: 'ship-fail',
      trackingNumber: 'TR-FAIL',
      findingKind: 'failed_unhandled',
      channel: 'email',
      templateKey: 'failed_delivery',
      tenantId: TENANT_A
    });
  });

  it('at_risk_soon stays flag-only (no PENDING_APPROVAL)', async () => {
    const inWindow = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const { app, prisma } = buildApp({
      shipment: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([]) // unassigned
          .mockResolvedValueOnce([]) // past_deadline
          .mockResolvedValueOnce([]) // failed_unhandled
          .mockResolvedValueOnce([
            { id: 'ship-risk', trackingNumber: 'TR-RISK', estimatedDelivery: inWindow }
          ])
      }
    });

    await runSweep(app, 'run-risk', TENANT_A);

    const writes = agentActionCreates(prisma);
    expect(writes).toHaveLength(1);
    expect(writes[0].data.type).toBe('flag_finding');
    expect((writes[0].data.payload as Record<string, unknown>).kind).toBe('at_risk_soon');
    expect(writes.find((c) => c.data.status === 'PENDING_APPROVAL')).toBeUndefined();
  });

  it('healthy coverage: 5 shipments with 1 unassigned writes 2 AgentAction rows (1 flag + 1 proposal), not 5', async () => {
    const { app, prisma } = buildApp({
      shipment: {
        // 5 non-terminal shipments total; 4 of them are healthy in-transit and never become rows.
        count: vi.fn().mockResolvedValue(5),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'ship-unassigned', trackingNumber: 'TR-1', status: 'PENDING' }])
          .mockResolvedValueOnce([]) // past_deadline
          .mockResolvedValueOnce([]) // failed_unhandled
          .mockResolvedValueOnce([]) // at_risk_soon
      },
      driver: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'drv-1',
            createdAt: new Date('2026-01-01'),
            user: { firstName: 'D', lastName: 'One', email: 'd1@x.com' },
            _count: { shipments: 1 }
          }
        ])
      }
    });

    await runSweep(app, 'run-coverage', TENANT_A);

    const writes = agentActionCreates(prisma);
    // Exactly 2 rows: 1 flag_finding for the unassigned shipment + 1 assign_shipment proposal.
    // NEVER one row per healthy shipment — that's what the Coverage view's on-track count is for.
    expect(writes).toHaveLength(2);
    expect(writes.filter((c) => c.data.type === 'flag_finding')).toHaveLength(1);
    expect(writes.filter((c) => c.data.type === 'assign_shipment')).toHaveLength(1);

    // onTrackCount = scanned (5) - unique flagged shipmentIds (1) = 4.
    const completed = (prisma.aiAgentRun.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0].data.status === 'COMPLETED'
    );
    expect(completed?.[0].data.onTrackCount).toBe(4);
  });

  it('empty sweep records onTrackCount equal to scanned', async () => {
    const { app, prisma } = buildApp({
      shipment: {
        count: vi.fn().mockResolvedValue(120),
        findMany: vi.fn().mockResolvedValue([])
      }
    });

    await runSweep(app, 'run-clear', TENANT_A);

    const completed = (prisma.aiAgentRun.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0].data.status === 'COMPLETED'
    );
    expect(completed?.[0].data.onTrackCount).toBe(120);
  });

  it('overloaded_driver stays flag-only (no PENDING_APPROVAL)', async () => {
    const { app, prisma } = buildApp({
      shipment: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([])
      },
      driver: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'drv-over',
            createdAt: new Date('2026-01-01'),
            user: { firstName: 'Over', lastName: 'Worked', email: 'over@x.com' },
            _count: { shipments: 12 }
          }
        ])
      }
    });

    await runSweep(app, 'run-over', TENANT_A);

    const writes = agentActionCreates(prisma);
    expect(writes).toHaveLength(1);
    expect(writes[0].data.type).toBe('flag_finding');
    expect((writes[0].data.payload as Record<string, unknown>).kind).toBe('overloaded_driver');
    expect(writes.find((c) => c.data.status === 'PENDING_APPROVAL')).toBeUndefined();
  });

  it('a proposeFix throw is isolated — sweep still completes', async () => {
    const { app, prisma } = buildApp({
      shipment: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'ship-1', trackingNumber: 'TR-1', status: 'PENDING' }])
          .mockResolvedValueOnce([]) // past_deadline
          .mockResolvedValueOnce([]) // failed_unhandled
          .mockResolvedValueOnce([]) // at_risk_soon
      },
      driver: {
        findMany: vi
          .fn()
          // First call: Phase 1 findOverloadedDrivers — returns empty so Phase 1 succeeds.
          .mockResolvedValueOnce([])
          // Second call: Phase 2 pickBestAvailableDriver — throws. The sweep's per-finding
          // try/catch must isolate this and let the sweep finish.
          .mockRejectedValueOnce(new Error('db down'))
      }
    });

    await expect(runSweep(app, 'run-throw', TENANT_A)).resolves.toBeUndefined();
    expect(app.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-throw', kind: 'unassigned' }),
      'sweep finding write failed'
    );
    const completedUpdate = (prisma.aiAgentRun.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0].data.status === 'COMPLETED'
    );
    expect(completedUpdate).toBeDefined();
  });

  it('fatal error marks the run as FAILED and rethrows', async () => {
    const { app, prisma } = buildApp({
      shipment: {
        count: vi.fn().mockRejectedValue(new Error('db down')),
        findMany: vi.fn().mockResolvedValue([])
      }
    });

    await expect(runSweep(app, 'run-fatal', TENANT_A)).rejects.toThrow('db down');

    const failedUpdate = (prisma.aiAgentRun.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0].data.status === 'FAILED'
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.[0].data.stage).toBe('failed');
  });
});
