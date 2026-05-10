import { Prisma } from '@prisma/client';
import type { FastifyInstance as FastifyApp } from 'fastify';
import { TrackingActorType, TrackingSource, TrackingVisibility } from '@fauward/tracking-core';

import { labelService } from '../documents/label.service.js';
import { createInAppNotifications } from '../notifications/notifications.routes.js';
import { buildStatusTitle, createTrackingEvent, statusToEventType } from '../tracking/tracking-event.service.js';

type ReturnItem = { shipmentItemId?: string; quantity?: number; description?: string };
type AnalyticsGroupBy = 'day' | 'week' | 'month';
type ReturnsAnalyticsFilters = {
  from?: string | Date;
  to?: string | Date;
  groupBy?: AnalyticsGroupBy;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseDateOrDefault(value: string | Date | undefined, fallback: Date) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value;
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function startOfPeriod(date: Date, groupBy: AnalyticsGroupBy) {
  const period = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (groupBy === 'month') {
    period.setUTCDate(1);
  } else if (groupBy === 'week') {
    const day = period.getUTCDay();
    const daysSinceMonday = (day + 6) % 7;
    period.setUTCDate(period.getUTCDate() - daysSinceMonday);
  }
  return period.toISOString().slice(0, 10);
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function notifyCustomer(app: FastifyApp, args: { tenantId: string; customerId: string; type: string; title: string; body: string; link: string }) {
  await createInAppNotifications(app, {
    tenantId: args.tenantId,
    userIds: [args.customerId],
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link
  });
}

async function addReturnTrackingEvent(app: FastifyApp, tenantId: string, shipment: { id: string; trackingNumber: string }, kind: 'initiated' | 'received') {
  const status = kind === 'initiated' ? 'RETURN_STARTED' : 'RETURNED';
  await createTrackingEvent(app.prisma, {
    tenantId,
    shipmentId: shipment.id,
    trackingNumber: shipment.trackingNumber,
    eventType: statusToEventType(status as any),
    status: status as any,
    title: buildStatusTitle(status as any),
    description: kind === 'initiated' ? 'Return initiated' : 'Return received at hub',
    source: TrackingSource.TENANT_PORTAL,
    actorType: TrackingActorType.SYSTEM,
    visibility: TrackingVisibility.CUSTOMER_VISIBLE,
    metadata: { returnEvent: kind === 'initiated' ? 'RETURN_INITIATED' : 'RETURN_RECEIVED' },
    idempotencyKey: `return:${kind}:${shipment.id}:${Date.now()}`,
    skipTransitionCheck: true
  });
}

export const returnsService = {
  async create(app: FastifyApp, tenantId: string, data: {
    shipmentId: string;
    customerId?: string;
    reason: string;
    notes?: string;
    items?: ReturnItem[];
    photos?: string[];
  }) {
    const shipment = await app.prisma.shipment.findFirst({
      where: { id: data.shipmentId, tenantId },
      include: { items: { select: { id: true } } }
    });
    if (!shipment) throw Object.assign(new Error('Shipment not found'), { statusCode: 404 });

    const validItemIds = new Set(shipment.items.map((item) => item.id));
    for (const item of data.items ?? []) {
      if (item.shipmentItemId && !validItemIds.has(item.shipmentItemId)) {
        throw Object.assign(new Error('Return item does not belong to shipment'), { statusCode: 422 });
      }
    }

    return app.prisma.returnRequest.create({
      data: {
        tenantId,
        shipmentId: shipment.id,
        customerId: data.customerId ?? shipment.customerId ?? '',
        organisationId: shipment.organisationId,
        reason: data.reason,
        notes: data.notes,
        items: data.items ? json(data.items) : undefined,
        photos: data.photos ?? [],
        refundStatus: 'PENDING',
        status: 'REQUESTED'
      } as any
    });
  },

  async approve(app: FastifyApp, tenantId: string, returnId: string, actorId?: string) {
    const existing = await app.prisma.returnRequest.findFirst({
      where: { id: returnId, tenantId },
      include: { shipment: { select: { id: true, trackingNumber: true } } }
    });
    if (!existing) return null;
    const label = await labelService.generate(app, tenantId, existing.shipmentId, 'PDF' as any, true);
    const updated = await app.prisma.returnRequest.update({
      where: { id: existing.id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        handledBy: actorId,
        labelId: label.id,
        returnLabel: label.url
      } as any
    });
    await addReturnTrackingEvent(app, tenantId, existing.shipment, 'initiated');
    await notifyCustomer(app, {
      tenantId,
      customerId: existing.customerId,
      type: 'return_approved',
      title: 'Return approved',
      body: 'Your return request has been approved.',
      link: `/returns/${existing.id}`
    });
    return updated;
  },

  async reject(app: FastifyApp, tenantId: string, returnId: string, reason?: string, actorId?: string) {
    const existing = await app.prisma.returnRequest.findFirst({ where: { id: returnId, tenantId } });
    if (!existing) return null;
    const updated = await app.prisma.returnRequest.update({
      where: { id: existing.id },
      data: {
        status: 'REJECTED',
        handledBy: actorId,
        notes: [existing.notes, reason ? `Rejected: ${reason}` : 'Rejected'].filter(Boolean).join('\n')
      } as any
    });
    await notifyCustomer(app, {
      tenantId,
      customerId: existing.customerId,
      type: 'return_rejected',
      title: 'Return rejected',
      body: reason ?? 'Your return request was rejected.',
      link: `/returns/${existing.id}`
    });
    return updated;
  },

  async receiveAtHub(app: FastifyApp, tenantId: string, returnId: string) {
    const existing = await app.prisma.returnRequest.findFirst({
      where: { id: returnId, tenantId },
      include: { shipment: { select: { id: true, trackingNumber: true } } }
    });
    if (!existing) return null;
    const updated = await app.prisma.returnRequest.update({
      where: { id: existing.id },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        reversedAt: new Date(),
        refundStatus: existing.refundStatus === 'PENDING' ? 'APPROVED' : existing.refundStatus
      } as any
    });
    await addReturnTrackingEvent(app, tenantId, existing.shipment, 'received');
    return updated;
  },

  async analytics(app: FastifyApp, tenantId: string, filters: ReturnsAnalyticsFilters = {}) {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = parseDateOrDefault(filters.from, defaultFrom);
    const to = parseDateOrDefault(filters.to, now);
    const groupBy: AnalyticsGroupBy = filters.groupBy === 'day' || filters.groupBy === 'month' ? filters.groupBy : 'week';

    const rows = await app.prisma.returnRequest.findMany({
      where: { tenantId, createdAt: { gte: from, lte: to } },
      include: { shipment: { select: { carrierAccountId: true } } },
      orderBy: { createdAt: 'asc' }
    });
    const periods = new Map<string, { period: string; total: number; byReason: Record<string, number>; byCarrier: Record<string, number> }>();
    const totals = { total: 0, byReason: {} as Record<string, number>, byCarrier: {} as Record<string, number> };

    for (const row of rows) {
      const periodKey = startOfPeriod(row.createdAt, groupBy);
      const period = periods.get(periodKey) ?? { period: periodKey, total: 0, byReason: {}, byCarrier: {} };
      const reason = row.reason?.trim() || 'UNSPECIFIED';
      const carrier = row.shipment?.carrierAccountId ?? 'unassigned';

      period.total += 1;
      increment(period.byReason, reason);
      increment(period.byCarrier, carrier);
      periods.set(periodKey, period);

      totals.total += 1;
      increment(totals.byReason, reason);
      increment(totals.byCarrier, carrier);
    }

    return {
      periods: Array.from(periods.values()),
      totals
    };
  }
};
