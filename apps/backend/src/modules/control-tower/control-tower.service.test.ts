import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const diagnoseMock = vi.hoisted(() => vi.fn(async () => ({ confidence: 0.9 })));
const gatewayRunMock = vi.hoisted(() => vi.fn());

vi.mock('../tracking/tracking.ai.service.js', () => ({
  trackingAiService: {
    diagnoseException: diagnoseMock
  }
}));

vi.mock('../../shared/services/llm-gateway.service.js', () => ({
  LLMGatewayService: vi.fn().mockImplementation(() => ({ run: gatewayRunMock }))
}));

import { detectStuckShipments } from './stuck-shipment.detector.js';
import { exceptionsService } from '../exceptions/exceptions.service.js';
import { controlTowerService } from './control-tower.service.js';

function buildPrisma(existingCase = false) {
  const cases: any[] = existingCase ? [{ id: 'case-existing', tenantId: 'tenant-a', shipmentId: 'ship-1', type: 'STUCK', status: 'OPEN' }] : [];
  return {
    tenant: { findMany: vi.fn(async () => [{ id: 'tenant-a' }]) },
    slaPolicy: {
      findFirst: vi.fn(async () => ({ id: 'sla-default', tenantId: 'tenant-a', isDefault: true, deliveryWindowHours: 24, createdAt: new Date() }))
    },
    shipment: {
      findMany: vi.fn(async () => [{
        id: 'ship-1',
        tenantId: 'tenant-a',
        status: 'IN_TRANSIT',
        trackingEvents: [{ id: 'event-1', createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }]
      }]),
      count: vi.fn(async () => 10)
    },
    webhookDelivery: { count: vi.fn(async () => 1) },
    supportTicket: { count: vi.fn(async () => 2) },
    exceptionCase: {
      findFirst: vi.fn(async () => cases.find((item) => item.status === 'OPEN') ?? null),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `case-${cases.length + 1}`, ...data };
        cases.push(row);
        return row;
      }),
      findMany: vi.fn(async () => cases),
      update: vi.fn(async ({ where, data }: any) => {
        const row = cases.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      count: vi.fn(async () => cases.length)
    }
  };
}

describe('control tower and exceptions', () => {
  beforeEach(() => {
    diagnoseMock.mockClear();
    gatewayRunMock.mockReset();
  });

  it('shipment with no update beyond SLA creates ExceptionCase type=STUCK', async () => {
    const app = Fastify();
    const prisma = buildPrisma();
    (app as any).decorate('prisma', prisma);

    const created = await detectStuckShipments(app as any, 'tenant-a');

    expect(created).toHaveLength(1);
    expect(prisma.exceptionCase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'STUCK', status: 'OPEN' })
    }));
  });

  it('second run does not create duplicate OPEN ExceptionCase', async () => {
    const app = Fastify();
    const prisma = buildPrisma(true);
    (app as any).decorate('prisma', prisma);

    const created = await detectStuckShipments(app as any, 'tenant-a');

    expect(created).toEqual([]);
    expect(prisma.exceptionCase.create).not.toHaveBeenCalled();
  });

  it('resolve sets status=RESOLVED and resolvedAt', async () => {
    const prisma = buildPrisma(true);

    const resolved = await exceptionsService.resolve(prisma as any, 'tenant-a', 'case-existing', 'Done');

    expect(resolved).toEqual(expect.objectContaining({ status: 'RESOLVED', notes: 'Done' }));
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
  });

  it('SlaPolicy with isDefault=true is used when no serviceType-specific policy exists', async () => {
    const app = Fastify();
    const prisma = buildPrisma();
    (app as any).decorate('prisma', prisma);

    await detectStuckShipments(app as any, 'tenant-a');

    expect(prisma.slaPolicy.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', isDefault: true }
    }));
  });

  it('superadmin tenant health returns healthScore for a tenant', async () => {
    const prisma = buildPrisma();
    gatewayRunMock.mockResolvedValue({
      result: {
        healthScore: 72,
        topRisks: ['webhooks'],
        recommendedAction: 'Review failed webhooks',
        escalate: false,
        confidence: 0.9
      }
    });

    const health = await controlTowerService.tenantHealth(prisma as any, 'tenant-a');

    expect(health).toEqual(expect.objectContaining({ tenantId: 'tenant-a', healthScore: 72 }));
    expect(gatewayRunMock).toHaveBeenCalledWith(expect.objectContaining({ task: 'tenant_health_summary' }));
  });
});
