import Fastify from 'fastify';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calculateMock = vi.hoisted(() => vi.fn());

vi.mock('../pricing/pricing.service.js', () => ({
  pricingService: {
    calculate: calculateMock
  }
}));

import { calculateChargeableWeightKg, calculateVolumetricWeightKg } from '@fauward/pricing-core';
import { registerRatingRoutes } from './rating.routes.js';
import { ratingService } from './rating.service.js';
import { LLMGatewayService } from '../../shared/services/llm-gateway.service.js';

function buildQuotePrisma(overrides: Partial<any> = {}) {
  const createMock = vi.fn(async ({ data }: any) => ({
    id: 'quote-1',
    ...data,
    createdAt: new Date()
  }));

  return {
    tenantSettings: {
      findUnique: vi.fn(async () => overrides.settings ?? { dimensionalDivisor: 5000, serviceTierConfig: {} })
    },
    carrierAccount: {
      findMany: vi.fn(async () => overrides.carrierAccounts ?? [])
    },
    rateQuote: {
      create: createMock,
      findFirst: vi.fn(async ({ where }: any) => overrides.quotes?.find((quote: any) => quote.id === where.id && quote.tenantId === where.tenantId) ?? null)
    }
  };
}

describe('rating service helpers', () => {
  beforeEach(() => {
    vi.useRealTimers();
    calculateMock.mockReset();
  });

  it('calculates volumetric weight using l x w x h / 5000 and uses the higher chargeable weight', () => {
    const dimensions = { lengthCm: 50, widthCm: 40, heightCm: 30 };
    expect(calculateVolumetricWeightKg(dimensions)).toBe(12);
    expect(calculateChargeableWeightKg(5, dimensions)).toBe(12);
    expect(calculateChargeableWeightKg(20, dimensions)).toBe(20);
  });

  it('adds base, fuel, insurance, and customs surcharges with no double-counting', async () => {
    calculateMock.mockResolvedValue({
      total: 122,
      subtotal: 122,
      taxAmount: 0,
      taxRate: 0,
      currency: 'GBP',
      chargeableWeightKg: 5,
      breakdown: [
        { label: 'Base rate', amount: 100 },
        { label: 'Fuel surcharge', amount: 10 },
        { label: 'Insurance', amount: 5 },
        { label: 'Customs surcharge', amount: 7 }
      ]
    });
    const prisma = buildQuotePrisma();

    const quote = await ratingService.quote(prisma as any, {
      tenantId: 'tenant-a',
      origin: { country: 'GB' },
      destination: { country: 'NG' },
      weightKg: 5,
      dimensions: { lengthCm: 10, widthCm: 10, heightCm: 10 },
      serviceType: 'STANDARD'
    });

    expect(quote.quotes[0]).toEqual(expect.objectContaining({
      carrier: 'Internal Fleet',
      price: 122
    }));
    expect(quote.quotes[0].surcharges.map((row) => row.amount).reduce((sum, amount) => sum + amount, 0)).toBe(122);
    expect(quote.quotes[0].surcharges.map((row) => row.label)).toEqual([
      'Base rate',
      'Fuel surcharge',
      'Insurance',
      'Customs surcharge'
    ]);
  });

  it('puts tenant preferred carriers before cheaper non-preferred carriers', () => {
    const ranked = ratingService.sortQuotes([
      {
        carrier: 'Budget Carrier',
        serviceLevel: 'Economy',
        source: 'EXTERNAL_CARRIER',
        price: 10,
        currency: 'GBP',
        chargeableWeightKg: 5,
        surcharges: []
      },
      {
        carrier: 'Preferred Express',
        serviceLevel: 'Express',
        source: 'EXTERNAL_CARRIER',
        price: 20,
        currency: 'GBP',
        chargeableWeightKg: 5,
        surcharges: []
      }
    ], ['Preferred Express']);

    expect(ranked[0].carrier).toBe('Preferred Express');
  });

  it('sets RateQuote.expiresAt to 30 minutes from creation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T10:00:00.000Z'));
    calculateMock.mockResolvedValue({
      total: 20,
      subtotal: 20,
      taxAmount: 0,
      taxRate: 0,
      currency: 'GBP',
      chargeableWeightKg: 2,
      breakdown: [{ label: 'Base rate', amount: 20 }]
    });
    const prisma = buildQuotePrisma();

    const quote = await ratingService.quote(prisma as any, {
      tenantId: 'tenant-a',
      origin: { country: 'GB' },
      destination: { country: 'NG' },
      weightKg: 2,
      dimensions: { lengthCm: 10, widthCm: 10, heightCm: 10 },
      serviceType: 'STANDARD'
    });

    expect(quote.expiresAt).toBe('2026-05-02T10:30:00.000Z');
    expect(prisma.rateQuote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        expiresAt: new Date('2026-05-02T10:30:00.000Z')
      })
    }));
  });

  it('rejects expired quotes at booking/selection time', () => {
    expect(() => ratingService.enforceNotExpired({ expiresAt: new Date(Date.now() - 1000) })).toThrow('expired');
  });
});

describe('rating AI limits', () => {
  const outputSchema = z.object({ confidence: z.number(), answer: z.string() });
  const proModel = ['deep', 'seek-v4-pro'].join('');
  const flashModel = ['deep', 'seek-v4-flash'].join('');

  function gatewayWithUsage(model: string, requestCount: number, limit: Record<string, unknown>) {
    return new LLMGatewayService({
      tenantAiLimit: { findUnique: vi.fn(async () => ({ monthlyBudgetUsd: null, featuresEnabled: [], ...limit })) },
      tenantAiUsage: { findMany: vi.fn(async () => [{ model, requestCount, costUsd: 0 }]) },
      aiAgentRun: { create: vi.fn(), update: vi.fn() }
    }, {
      chat: { completions: { create: vi.fn() } }
    } as any);
  }

  it('returns HTTP 429 AI_LIMIT_EXCEEDED when TenantAiLimit.proRequestLimit is exceeded for rating AI explanation', async () => {
    const gateway = gatewayWithUsage(proModel, 1, { proRequestLimit: 1, flashRequestLimit: null });

    await expect(gateway.run({
      task: 'pricing_anomaly_detection',
      tenantId: 'tenant-a',
      input: { quoteId: 'quote-1' },
      outputSchema
    })).rejects.toMatchObject({ statusCode: 429, payload: { error: 'AI_LIMIT_EXCEEDED' } });
  });

  it('returns HTTP 429 AI_LIMIT_EXCEEDED when TenantAiLimit.flashRequestLimit is exceeded for quote explanation', async () => {
    const gateway = gatewayWithUsage(flashModel, 1, { flashRequestLimit: 1, proRequestLimit: null });

    await expect(gateway.run({
      task: 'quote_explanation',
      tenantId: 'tenant-a',
      input: { quoteId: 'quote-1' },
      outputSchema
    })).rejects.toMatchObject({ statusCode: 429, payload: { error: 'AI_LIMIT_EXCEEDED' } });
  });
});

describe('rating routes tenant isolation', () => {
  const apps: any[] = [];

  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('GET /rates/carriers returns only the requesting tenant carrier accounts', async () => {
    const app = Fastify();
    apps.push(app);
    const carriers = [
      { id: 'carrier-a', tenantId: 'tenant-a', name: 'Tenant A Carrier', carrier: 'A', serviceLevels: [] },
      { id: 'carrier-b', tenantId: 'tenant-b', name: 'Tenant B Carrier', carrier: 'B', serviceLevels: [] }
    ];
    const prisma = {
      carrierAccount: {
        findMany: vi.fn(async ({ where }: any) => carriers.filter((carrier) => carrier.tenantId === where.tenantId))
      }
    };

    (app as any).decorate('prisma', prisma);
    (app as any).decorate('authenticate', async (request: any) => {
      request.user = { sub: 'user-a', role: 'TENANT_ADMIN', tenantId: 'tenant-a' };
    });
    app.addHook('onRequest', (request, _reply, done) => {
      (request as any).tenant = { id: 'tenant-a', slug: 'tenant-a', plan: 'PRO' };
      done();
    });

    await registerRatingRoutes(app as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenant/rates/carriers'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().carriers).toEqual([expect.objectContaining({ id: 'carrier-a' })]);
    expect(prisma.carrierAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a' }
    }));
  });
});
