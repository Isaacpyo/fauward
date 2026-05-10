import { describe, expect, it, vi } from 'vitest';

const diagnoseExceptionMock = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock('../tracking/tracking.ai.service.js', () => ({
  trackingAiService: {
    diagnoseException: diagnoseExceptionMock
  }
}));

import { detectStuckShipments } from './stuck-shipment.detector.js';

describe('stuck shipment detector', () => {
  it('creates one STUCK ExceptionCase for a shipment past its SLA window and does not duplicate it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00.000Z'));
    const exceptionCases: any[] = [];
    const app = {
      prisma: {
        tenant: { findMany: vi.fn(async () => [{ id: 'tenant-a' }]) },
        slaPolicy: { findFirst: vi.fn(async () => ({ deliveryWindowHours: 24 })) },
        shipment: {
          findMany: vi.fn(async () => [{
            id: 'ship-1',
            tenantId: 'tenant-a',
            status: 'IN_TRANSIT',
            trackingEvents: [{ createdAt: new Date('2026-05-01T08:00:00.000Z') }]
          }])
        },
        exceptionCase: {
          findFirst: vi.fn(async ({ where }: any) => exceptionCases.find((row) => (
            row.tenantId === where.tenantId &&
            row.shipmentId === where.shipmentId &&
            row.type === where.type &&
            where.status.in.includes(row.status)
          )) ?? null),
          create: vi.fn(async ({ data }: any) => {
            const row = { id: `exception-${exceptionCases.length + 1}`, ...data };
            exceptionCases.push(row);
            return row;
          })
        }
      },
      log: { error: vi.fn() }
    };

    const firstRun = await detectStuckShipments(app as any);
    const secondRun = await detectStuckShipments(app as any);

    expect(firstRun).toHaveLength(1);
    expect(secondRun).toHaveLength(0);
    expect(exceptionCases).toHaveLength(1);
    expect(exceptionCases[0]).toEqual(expect.objectContaining({ type: 'STUCK', status: 'OPEN' }));
    expect(diagnoseExceptionMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
