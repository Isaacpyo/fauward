import type { PrismaClient, ShipmentStatus } from '@prisma/client';

export const ACTIVE_STATUSES: ShipmentStatus[] = [
  'PENDING',
  'PROCESSING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'FAILED_DELIVERY',
  'EXCEPTION'
];

const UNASSIGNED_STATUSES: ShipmentStatus[] = ['PENDING', 'PROCESSING', 'PICKED_UP', 'OUT_FOR_DELIVERY'];

export const NON_TERMINAL_STATUSES: ShipmentStatus[] = [
  'PENDING',
  'PROCESSING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'FAILED_DELIVERY',
  'EXCEPTION'
];

export const DRIVER_OVERLOAD_THRESHOLD = 8;

// "At risk" = estimated to deliver within this many hours, status still active.
// Past that mark, the shipment falls into past_deadline (a separate, actionable group).
export const AT_RISK_WINDOW_HOURS = 24;

export type FindingKind =
  | 'unassigned'
  | 'overloaded_driver'
  | 'past_deadline'
  | 'failed_unhandled'
  | 'stuck'
  | 'at_risk_soon';

export type Finding =
  | {
      kind: 'unassigned';
      shipmentId: string;
      trackingNumber: string;
      status: ShipmentStatus;
    }
  | {
      kind: 'overloaded_driver';
      driverId: string;
      driverName: string;
      activeJobCount: number;
    }
  | {
      kind: 'past_deadline';
      shipmentId: string;
      trackingNumber: string;
      estimatedDelivery: string;
    }
  | {
      kind: 'failed_unhandled';
      shipmentId: string;
      trackingNumber: string;
      failedAt: string;
    }
  | {
      kind: 'stuck';
      shipmentId: string;
      trackingNumber: string;
      exceptionCaseId: string;
    }
  | {
      kind: 'at_risk_soon';
      shipmentId: string;
      trackingNumber: string;
      estimatedDelivery: string;
    };

export async function findUnassigned(prisma: PrismaClient, tenantId: string): Promise<Finding[]> {
  const rows = await prisma.shipment.findMany({
    where: {
      tenantId,
      assignedDriverId: null,
      status: { in: UNASSIGNED_STATUSES }
    },
    select: { id: true, trackingNumber: true, status: true },
    take: 200
  });
  return rows.map((r) => ({
    kind: 'unassigned' as const,
    shipmentId: r.id,
    trackingNumber: r.trackingNumber,
    status: r.status
  }));
}

export async function findOverloadedDrivers(
  prisma: PrismaClient,
  tenantId: string,
  threshold: number = DRIVER_OVERLOAD_THRESHOLD
): Promise<Finding[]> {
  const drivers = await prisma.driver.findMany({
    where: { tenantId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      _count: { select: { shipments: { where: { status: { in: ACTIVE_STATUSES } } } } }
    }
  });
  return drivers
    .filter((d) => d._count.shipments > threshold)
    .map((d) => ({
      kind: 'overloaded_driver' as const,
      driverId: d.id,
      driverName: [d.user.firstName, d.user.lastName].filter(Boolean).join(' ') || d.user.email,
      activeJobCount: d._count.shipments
    }));
}

export async function findPastDeadline(prisma: PrismaClient, tenantId: string): Promise<Finding[]> {
  const rows = await prisma.shipment.findMany({
    where: {
      tenantId,
      estimatedDelivery: { lt: new Date() },
      status: { in: NON_TERMINAL_STATUSES }
    },
    select: { id: true, trackingNumber: true, estimatedDelivery: true },
    take: 200
  });
  return rows
    .filter((r): r is typeof r & { estimatedDelivery: Date } => r.estimatedDelivery !== null)
    .map((r) => ({
      kind: 'past_deadline' as const,
      shipmentId: r.id,
      trackingNumber: r.trackingNumber,
      estimatedDelivery: r.estimatedDelivery.toISOString()
    }));
}

export async function findFailedUnhandled(prisma: PrismaClient, tenantId: string): Promise<Finding[]> {
  const rows = await prisma.shipment.findMany({
    where: { tenantId, status: 'FAILED_DELIVERY' },
    select: {
      id: true,
      trackingNumber: true,
      events: {
        where: { status: 'FAILED_DELIVERY' },
        orderBy: { timestamp: 'desc' },
        take: 1,
        select: { timestamp: true }
      }
    },
    take: 200
  });
  return rows.map((r) => ({
    kind: 'failed_unhandled' as const,
    shipmentId: r.id,
    trackingNumber: r.trackingNumber,
    failedAt: (r.events[0]?.timestamp ?? new Date()).toISOString()
  }));
}

export async function findStuck(prisma: PrismaClient, tenantId: string): Promise<Finding[]> {
  const cases = await (prisma as unknown as {
    exceptionCase: {
      findMany: (args: unknown) => Promise<
        Array<{
          id: string;
          shipmentId: string;
          shipment: { trackingNumber: string } | null;
        }>
      >;
    };
  }).exceptionCase.findMany({
    where: { tenantId, type: 'STUCK', status: { in: ['OPEN', 'IN_PROGRESS'] } },
    include: { shipment: { select: { trackingNumber: true } } },
    take: 200
  });

  return cases
    .filter((c) => c.shipment !== null)
    .map((c) => ({
      kind: 'stuck' as const,
      shipmentId: c.shipmentId,
      trackingNumber: c.shipment!.trackingNumber,
      exceptionCaseId: c.id
    }));
}

export async function findAtRiskSoon(
  prisma: PrismaClient,
  tenantId: string,
  windowHours: number = AT_RISK_WINDOW_HOURS
): Promise<Finding[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
  const rows = await prisma.shipment.findMany({
    where: {
      tenantId,
      // Inside the window, not yet past — past_deadline owns that case.
      estimatedDelivery: { gte: now, lte: horizon },
      status: { in: NON_TERMINAL_STATUSES }
    },
    select: { id: true, trackingNumber: true, estimatedDelivery: true },
    take: 200
  });
  return rows
    .filter((r): r is typeof r & { estimatedDelivery: Date } => r.estimatedDelivery !== null)
    .map((r) => ({
      kind: 'at_risk_soon' as const,
      shipmentId: r.id,
      trackingNumber: r.trackingNumber,
      estimatedDelivery: r.estimatedDelivery.toISOString()
    }));
}

export async function runDetectors(prisma: PrismaClient, tenantId: string): Promise<Finding[]> {
  const [unassigned, overloaded, pastDeadline, failed, stuck, atRisk] = await Promise.all([
    findUnassigned(prisma, tenantId),
    findOverloadedDrivers(prisma, tenantId),
    findPastDeadline(prisma, tenantId),
    findFailedUnhandled(prisma, tenantId),
    findStuck(prisma, tenantId),
    findAtRiskSoon(prisma, tenantId)
  ]);
  return [...unassigned, ...overloaded, ...pastDeadline, ...failed, ...stuck, ...atRisk];
}
