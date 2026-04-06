import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { calculatePricingSchema } from './pricing.schema.js';
import { pricingService } from './pricing.service.js';
import { registerPricingZoneRoutes } from './zones.routes.js';
import { registerPricingRateCardRoutes } from './rate-cards.routes.js';
import { registerPricingSurchargeRoutes } from './surcharges.routes.js';
import { registerPricingRuleRoutes } from './rules.routes.js';
import { registerPricingPromoCodeRoutes } from './promo-codes.routes.js';
import { registerPricingWeightTierRoutes } from './weight-tiers.routes.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function atLeastOneTierEnabled(config: Record<string, any>) {
  return Object.values(config).some((tier: any) => Boolean(tier?.isEnabled));
}

export async function registerPricingRoutes(app: FastifyInstance) {
  await app.register(async (pricingApp) => {
    await registerPricingZoneRoutes(pricingApp);
    await registerPricingRateCardRoutes(pricingApp);
    await registerPricingSurchargeRoutes(pricingApp);
    await registerPricingRuleRoutes(pricingApp);
    await registerPricingPromoCodeRoutes(pricingApp);
    await registerPricingWeightTierRoutes(pricingApp);

    pricingApp.patch(
      '/service-tiers',
      { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
      async (request, reply) => {
        const tenantId = getTenantId(request, reply);
        if (!tenantId) return;
        const serviceTierConfig = request.body as Record<string, any>;
        if (!serviceTierConfig || typeof serviceTierConfig !== 'object') {
          return reply.status(400).send({ error: 'serviceTierConfig object required' });
        }
        if (!atLeastOneTierEnabled(serviceTierConfig)) {
          return reply.status(400).send({ error: 'At least one service tier must be enabled' });
        }
        const settings = await pricingApp.prisma.tenantSettings.upsert({
          where: { tenantId },
          create: { tenantId, serviceTierConfig },
          update: { serviceTierConfig }
        });
        reply.send(settings);
      }
    );

    pricingApp.patch(
      '/insurance',
      { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
      async (request, reply) => {
        const tenantId = getTenantId(request, reply);
        if (!tenantId) return;
        const insuranceConfig = request.body as Record<string, any>;
        const tiers: Array<Record<string, any>> = Array.isArray(insuranceConfig?.tiers) ? insuranceConfig.tiers : [];
        const noneTier = tiers.find((tier) => tier.key === 'NONE');
        if (!noneTier || noneTier.enabled !== true) {
          return reply.status(400).send({ error: 'NONE insurance tier must exist and be enabled' });
        }
        const settings = await pricingApp.prisma.tenantSettings.upsert({
          where: { tenantId },
          create: { tenantId, insuranceConfig },
          update: { insuranceConfig }
        });
        reply.send(settings);
      }
    );

    pricingApp.patch(
      '/tax',
      { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
      async (request, reply) => {
        const tenantId = getTenantId(request, reply);
        if (!tenantId) return;
        const taxConfig = request.body as Record<string, any>;
        const rate = Number(taxConfig?.rate ?? 0);
        if (rate < 0 || rate > 100) {
          return reply.status(400).send({ error: 'Tax rate must be between 0 and 100' });
        }
        const settings = await pricingApp.prisma.tenantSettings.upsert({
          where: { tenantId },
          create: { tenantId, taxConfig },
          update: { taxConfig }
        });
        reply.send(settings);
      }
    );

    pricingApp.get(
      '/settings',
      { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
      async (request, reply) => {
        const tenantId = getTenantId(request, reply);
        if (!tenantId) return;
        const settings = await pricingApp.prisma.tenantSettings.findUnique({ where: { tenantId } });
        reply.send({
          dimensionalDivisor: settings?.dimensionalDivisor ?? 5000,
          roundingMode: settings?.roundingMode ?? 'ROUND_HALF_UP',
          roundingPrecision: settings?.roundingPrecision ?? 2,
          defaultCurrency: settings?.currency ?? 'GBP',
          weightTierConflictPolicy: settings?.weightTierConflictPolicy ?? 'BEST_FOR_CUSTOMER',
          quoteValidityMinutes: settings?.quoteValidityMinutes ?? 30,
          showPriceBreakdownToCustomer: settings?.showPriceBreakdownToCustomer ?? true,
          autoInvoiceOnDelivery: settings?.autoInvoiceOnDelivery ?? false
        });
      }
    );

    pricingApp.patch(
      '/settings',
      { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
      async (request, reply) => {
        const tenantId = getTenantId(request, reply);
        if (!tenantId) return;
        const payload = request.body as {
          dimensionalDivisor?: number;
          roundingMode?: string;
          roundingPrecision?: number;
          defaultCurrency?: string;
          weightTierConflictPolicy?: string;
          quoteValidityMinutes?: number;
          showPriceBreakdownToCustomer?: boolean;
          autoInvoiceOnDelivery?: boolean;
        };
        const settings = await pricingApp.prisma.tenantSettings.upsert({
          where: { tenantId },
          create: {
            tenantId,
            dimensionalDivisor: payload.dimensionalDivisor ?? 5000,
            roundingMode: payload.roundingMode ?? 'ROUND_HALF_UP',
            roundingPrecision: payload.roundingPrecision ?? 2,
            currency: payload.defaultCurrency ?? 'GBP',
            weightTierConflictPolicy: payload.weightTierConflictPolicy ?? 'BEST_FOR_CUSTOMER',
            quoteValidityMinutes: payload.quoteValidityMinutes ?? 30,
            showPriceBreakdownToCustomer: payload.showPriceBreakdownToCustomer ?? true,
            autoInvoiceOnDelivery: payload.autoInvoiceOnDelivery ?? false
          },
          update: {
            dimensionalDivisor: payload.dimensionalDivisor,
            roundingMode: payload.roundingMode,
            roundingPrecision: payload.roundingPrecision,
            currency: payload.defaultCurrency,
            weightTierConflictPolicy: payload.weightTierConflictPolicy,
            quoteValidityMinutes: payload.quoteValidityMinutes,
            showPriceBreakdownToCustomer: payload.showPriceBreakdownToCustomer,
            autoInvoiceOnDelivery: payload.autoInvoiceOnDelivery
          }
        });
        reply.send(settings);
      }
    );

    pricingApp.get(
      '/currency-rates',
      { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
      async (request, reply) => {
        const rates = await pricingApp.prisma.currencyRate.findMany({
          orderBy: { fetchedAt: 'desc' },
          take: 200
        });
        reply.send({ rates });
      }
    );

    pricingApp.post(
      '/currency-rates',
      { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
      async (request, reply) => {
        const { fromCurrency, toCurrency, rate } = request.body as {
          fromCurrency?: string;
          toCurrency?: string;
          rate?: number;
        };
        if (!fromCurrency || !toCurrency || rate === undefined) {
          return reply.status(400).send({ error: 'fromCurrency, toCurrency and rate are required' });
        }

        const record = await pricingApp.prisma.currencyRate.upsert({
          where: { fromCurrency_toCurrency: { fromCurrency, toCurrency } },
          create: {
            fromCurrency,
            toCurrency,
            rate,
            source: 'MANUAL'
          },
          update: {
            rate,
            source: 'MANUAL',
            fetchedAt: new Date()
          }
        });
        reply.send(record);
      }
    );

    pricingApp.post(
      '/currency-rates/refresh',
      { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
      async (_request, reply) => {
        reply.send({
          queued: true,
          jobId: `rates-${Date.now()}`,
          message: 'Currency refresh job queued'
        });
      }
    );

    pricingApp.post('/calculate', { preHandler: [authenticate] }, async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;
      const payload = calculatePricingSchema.parse(request.body);
      const result = await pricingService.calculate(pricingApp.prisma, {
        tenantId,
        originZoneId: payload.originZoneId,
        destZoneId: payload.destZoneId,
        serviceTier: payload.serviceTier,
        weightKg: payload.weightKg,
        lengthCm: payload.lengthCm,
        widthCm: payload.widthCm,
        heightCm: payload.heightCm,
        declaredValue: payload.declaredValue,
        insuranceTier: payload.insuranceTier,
        promoCode: payload.promoCode,
        customerId: payload.customerId,
        at: payload.date ? new Date(payload.date) : undefined
      });
      reply.send(result);
    });
  }, { prefix: '/api/v1/pricing' });
}

