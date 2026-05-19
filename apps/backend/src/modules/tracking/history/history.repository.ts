import type { PrismaClient } from '@prisma/client';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

export async function findBreadcrumbs(
  prisma: PrismaClient,
  tenantId: string,
  shipmentId: string,
  options?: { since?: Date; limit?: number }
) {
  const limit = Math.min(options?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const where: Record<string, unknown> = {
    tenantId,
    shipmentId,
  };

  if (options?.since) {
    (where as any).occurredAt = {
      gte: options.since,
    };
  }

  return prisma.trackingBreadcrumb.findMany({
    where,
    orderBy: { occurredAt: 'asc' },
    take: limit,
  });
}

export async function batchInsertBreadcrumbs(
  prisma: PrismaClient,
  rows: Array<{
    tenantId: string;
    shipmentId: string;
    seq: bigint;
    eventType: string;
    lat?: number;
    lng?: number;
    accuracyM?: number;
    status?: string;
    source: string;
    sourceRef?: string;
    occurredAt: Date;
  }>
): Promise<void> {
  if (rows.length === 0) return;

  await prisma.trackingBreadcrumb.createMany({
    data: rows.map((r) => ({
      tenantId: r.tenantId,
      shipmentId: r.shipmentId,
      seq: r.seq,
      eventType: r.eventType,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      accuracyM: r.accuracyM ?? null,
      status: r.status ?? null,
      source: r.source,
      sourceRef: r.sourceRef ?? null,
      occurredAt: r.occurredAt,
    })),
    skipDuplicates: true,
  });
}
