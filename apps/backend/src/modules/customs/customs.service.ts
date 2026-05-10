import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { TrackingActorType, TrackingSource, TrackingVisibility } from '@fauward/tracking-core';

import { publishPythonServiceJob } from '../../queues/python-services.js';
import { buildStatusTitle, createTrackingEvent, statusToEventType } from '../tracking/tracking-event.service.js';

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function workerDeclarationType(_type: string) {
  return 'uk_cds';
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['DRAFT', 'SUBMITTED'],
  SUBMITTED: ['SUBMITTED', 'CLEARED', 'HELD', 'REJECTED'],
  HELD: ['HELD', 'CLEARED', 'REJECTED'],
  CLEARED: ['CLEARED'],
  REJECTED: ['REJECTED']
};

function assertAllowedStatusTransition(from: string, to: string) {
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Object.assign(new Error(`Invalid customs status transition from ${from} to ${to}`), { statusCode: 422 });
  }
}

async function createCustomsTrackingEvent(
  prisma: PrismaClient,
  args: { tenantId: string; shipmentId: string; status: 'CUSTOMS_HOLD' | 'CUSTOMS_RELEASED'; description?: string | null }
) {
  const shipment = await prisma.shipment.findFirst({
    where: { id: args.shipmentId, tenantId: args.tenantId },
    select: { id: true, trackingNumber: true }
  });
  if (!shipment) return;
  await createTrackingEvent(prisma, {
    tenantId: args.tenantId,
    shipmentId: shipment.id,
    trackingNumber: shipment.trackingNumber,
    eventType: statusToEventType(args.status),
    status: args.status,
    title: buildStatusTitle(args.status),
    description: args.description ?? undefined,
    source: TrackingSource.SYSTEM_AUTOMATION,
    actorType: TrackingActorType.SYSTEM,
    visibility: TrackingVisibility.CUSTOMER_VISIBLE,
    metadata: { customs: true },
    idempotencyKey: `customs:${args.status}:${shipment.id}:${Date.now()}`,
    skipTransitionCheck: true
  });
}

export const customsService = {
  async createDeclaration(
    app: FastifyInstance,
    tenantId: string,
    shipmentId: string,
    data: { type: 'DDP' | 'DDU'; items: unknown[]; totalValue: number; currency: string; documents?: unknown[] }
  ) {
    const shipment = await app.prisma.shipment.findFirst({ where: { id: shipmentId, tenantId }, select: { id: true } });
    if (!shipment) return null;

    const declaration = await (app.prisma as any).customsDeclaration.create({
      data: {
        tenantId,
        shipmentId,
        type: data.type,
        items: json(data.items),
        totalValue: data.totalValue,
        currency: data.currency,
        documents: data.documents ? json(data.documents) : undefined,
        status: 'DRAFT'
      }
    });

    await app.prisma.shipment.update({
      where: { id: shipment.id },
      data: { customsDeclarationId: declaration.id } as any
    });

    await publishPythonServiceJob(app, 'fauward:customs:generate', {
      jobId: declaration.id,
      tenantId,
      shipmentId,
      declarationType: workerDeclarationType(data.type),
      options: {
        dutyResponsibility: data.type,
        items: data.items,
        documents: data.documents ?? []
      }
    });

    return declaration;
  },

  async getDeclaration(prisma: PrismaClient, tenantId: string, shipmentId: string) {
    return (prisma as any).customsDeclaration.findFirst({ where: { tenantId, shipmentId } });
  },

  async updateDeclaration(
    app: FastifyInstance,
    tenantId: string,
    shipmentId: string,
    data: Record<string, unknown>
  ) {
    const existing = await (app.prisma as any).customsDeclaration.findFirst({ where: { tenantId, shipmentId } });
    if (!existing) return null;
    if (typeof data.status === 'string') {
      assertAllowedStatusTransition(existing.status, data.status);
    }
    const updated = await (app.prisma as any).customsDeclaration.update({
      where: { id: existing.id },
      data: {
        type: data.type,
        items: data.items === undefined ? undefined : json(data.items),
        totalValue: data.totalValue,
        currency: data.currency,
        documents: data.documents === undefined ? undefined : json(data.documents),
        status: data.status,
        holdReason: data.holdReason
      }
    });

    if (data.status === 'HELD') {
      await createCustomsTrackingEvent(app.prisma, {
        tenantId,
        shipmentId,
        status: 'CUSTOMS_HOLD',
        description: typeof data.holdReason === 'string' ? data.holdReason : 'Customs hold'
      });
    }
    if (data.status === 'CLEARED') {
      await createCustomsTrackingEvent(app.prisma, {
        tenantId,
        shipmentId,
        status: 'CUSTOMS_RELEASED',
        description: 'Customs cleared'
      });
    }

    return updated;
  },

  restrictedItems(country: string) {
    const common = [
      { category: 'Aerosols', warning: 'May require carrier approval and special handling.' },
      { category: 'Lithium batteries', warning: 'Check watt-hour limits and packaging requirements.' }
    ];
    const byCountry: Record<string, Array<{ category: string; warning: string }>> = {
      NG: [{ category: 'Used electronics', warning: 'May require additional customs documentation.' }],
      AE: [{ category: 'Printed media', warning: 'May be subject to content review.' }]
    };
    return { country, items: [...common, ...(byCountry[country.toUpperCase()] ?? [])], hardBlock: false };
  }
};
