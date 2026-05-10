import { beforeEach, describe, expect, it, vi } from 'vitest';

const runMock = vi.hoisted(() => vi.fn());

vi.mock('../../shared/services/llm-gateway.service.js', () => ({
  LLMGatewayService: vi.fn().mockImplementation(() => ({ run: runMock })),
  MODEL_ROUTING: {
    tracking_customer_summary: 'customer-summary-model',
    tracking_exception_analysis: 'exception-analysis-model'
  }
}));

import { trackingAiService } from './tracking.ai.service.js';
import { MODEL_ROUTING } from '../../shared/services/llm-gateway.service.js';

function prisma() {
  const exceptionCases: any[] = [];
  return {
    exceptionCases,
    trackingSnapshot: {
      findFirst: vi.fn(async () => ({
        shipmentId: 'ship-1',
        tenantId: 'tenant-a',
        currentStatus: 'CUSTOMS_HOLD',
        customerStatus: 'Delayed',
        currentMessage: null
      }))
    },
    trackingEvent: {
      findMany: vi.fn(async () => [{ id: 'event-1', eventType: 'CUSTOMS_HOLD' }])
    },
    slaPolicy: {
      findFirst: vi.fn(async () => ({ id: 'sla-1', deliveryWindowHours: 24, isDefault: true }))
    },
    exceptionCase: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: any) => {
        exceptionCases.push(data);
        return data;
      })
    }
  };
}

describe('tracking AI service', () => {
  beforeEach(() => {
    runMock.mockReset();
  });

  it('CUSTOMS_HOLD never appears in customerMessage output', async () => {
    const db = prisma();
    runMock.mockResolvedValue({
      result: { customerMessage: 'CUSTOMS_HOLD', confidence: 0.9 },
      confidence: 0.9,
      model: MODEL_ROUTING.tracking_customer_summary,
      tokensUsed: 1,
      latencyMs: 1,
      degraded: false
    });

    const result = await trackingAiService.getCustomerSummary(db as any, 'ship-1', 'tenant-a');

    expect(result?.customerMessage).toBe('Your shipment is being processed by customs');
  });

  it('diagnoseException returns structured output with confidence', async () => {
    const db = prisma();
    runMock.mockResolvedValue({
      result: {
        likelyCause: 'customs delay',
        recommendedAction: 'review invoice',
        shouldNotifyCustomer: true,
        customerUpdate: 'We are reviewing customs paperwork.',
        escalationPriority: 'MEDIUM',
        confidence: 0.7
      },
      confidence: 0.7,
      model: MODEL_ROUTING.tracking_exception_analysis,
      tokensUsed: 5,
      latencyMs: 2,
      degraded: false
    });

    const result = await trackingAiService.diagnoseException(db as any, 'ship-1', 'tenant-a');

    expect(result).toEqual(expect.objectContaining({ confidence: 0.7, escalationPriority: 'MEDIUM' }));
  });

  it('high-confidence HIGH-priority diagnosis auto-creates ExceptionCase', async () => {
    const db = prisma();
    runMock.mockResolvedValue({
      result: {
        likelyCause: 'customs hold',
        recommendedAction: 'call broker',
        shouldNotifyCustomer: true,
        customerUpdate: 'We are working with customs.',
        escalationPriority: 'HIGH',
        confidence: 0.9
      },
      confidence: 0.9,
      model: MODEL_ROUTING.tracking_exception_analysis,
      tokensUsed: 5,
      latencyMs: 2,
      degraded: false
    });

    await trackingAiService.diagnoseException(db as any, 'ship-1', 'tenant-a');

    expect(db.exceptionCase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'CUSTOMS_HOLD', severity: 'HIGH', status: 'OPEN' })
    }));
  });

  it('low confidence does not auto-create ExceptionCase', async () => {
    const db = prisma();
    runMock.mockResolvedValue({
      result: {
        likelyCause: 'unknown',
        recommendedAction: 'review',
        shouldNotifyCustomer: false,
        customerUpdate: '',
        escalationPriority: 'HIGH',
        confidence: 0.5
      },
      confidence: 0.5,
      model: MODEL_ROUTING.tracking_exception_analysis,
      tokensUsed: 5,
      latencyMs: 2,
      degraded: false
    });

    await trackingAiService.diagnoseException(db as any, 'ship-1', 'tenant-a');

    expect(db.exceptionCase.create).not.toHaveBeenCalled();
  });
});
