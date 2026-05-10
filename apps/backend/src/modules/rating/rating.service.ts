import { Prisma, type PrismaClient } from '@prisma/client';
import {
  calculateChargeableWeightKg,
  calculateVolumetricWeightKg,
  type CarrierOption,
  type RateQuote
} from '@fauward/pricing-core';

import { pricingService } from '../pricing/pricing.service.js';
import { carrierAccountService } from './carrier-account.service.js';

type RatingInput = {
  tenantId: string;
  origin: Record<string, unknown>;
  destination: Record<string, unknown>;
  weightKg: number;
  dimensions: { lengthCm: number; widthCm: number; heightCm: number };
  serviceType: string;
  shipmentId?: string;
  declaredValue?: number;
  insuranceTier?: string;
  preferredCarriers?: string[];
  isSandbox?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCarrier(value: string) {
  return value.trim().toLowerCase();
}

function configuredPreferredCarriers(settings: unknown): string[] {
  const rec = asRecord(settings);
  const rating = asRecord(rec.rating);
  const preference = rating.preferredCarriers ?? rec.preferredCarriers ?? rec.carrierPreference;
  return Array.isArray(preference) ? preference.filter((item): item is string => typeof item === 'string') : [];
}

function sortQuotes(quotes: CarrierOption[], preferredCarriers: string[]) {
  const preferred = new Map(preferredCarriers.map((carrier, index) => [normalizeCarrier(carrier), index]));

  return [...quotes].sort((a, b) => {
    const aPreferred = preferred.has(normalizeCarrier(a.carrier));
    const bPreferred = preferred.has(normalizeCarrier(b.carrier));
    if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    if (aPreferred && bPreferred) {
      const prefDelta = preferred.get(normalizeCarrier(a.carrier))! - preferred.get(normalizeCarrier(b.carrier))!;
      if (prefDelta !== 0) return prefDelta;
    }
    if (a.price !== b.price) return a.price - b.price;
    return (a.transitDays ?? 999) - (b.transitDays ?? 999);
  });
}

async function quoteExternalCarrier(
  account: Awaited<ReturnType<typeof carrierAccountService.active>>[number],
  input: RatingInput,
  chargeableWeightKg: number
): Promise<CarrierOption[]> {
  const credentials = asRecord(account.credentials);
  const quoteUrl = typeof credentials.quoteUrl === 'string' ? credentials.quoteUrl : null;

  if (quoteUrl) {
    const response = await fetch(quoteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(typeof credentials.apiKey === 'string' ? { Authorization: `Bearer ${credentials.apiKey}` } : {})
      },
      body: JSON.stringify({
        origin: input.origin,
        destination: input.destination,
        weightKg: input.weightKg,
        chargeableWeightKg,
        dimensions: input.dimensions,
        serviceType: input.serviceType
      }),
      signal: AbortSignal.timeout(8_000)
    });

    if (!response.ok) {
      throw new Error(`Carrier ${account.carrier} quote failed with ${response.status}`);
    }

    const body = asRecord(await response.json());
    const quotes = Array.isArray(body.quotes) ? body.quotes : [];
    return quotes.map((quote) => {
      const rec = asRecord(quote);
      return {
        carrier: String(rec.carrier ?? account.carrier),
        serviceLevel: String(rec.serviceLevel ?? rec.service ?? 'STANDARD'),
        source: 'EXTERNAL_CARRIER',
        price: asNumber(rec.price),
        currency: String(rec.currency ?? 'GBP'),
        transitDays: rec.transitDays === undefined ? undefined : asNumber(rec.transitDays),
        chargeableWeightKg,
        surcharges: Array.isArray(rec.surcharges) ? rec.surcharges as CarrierOption['surcharges'] : [],
        metadata: { carrierAccountId: account.id }
      };
    });
  }

  const baseRate = asNumber(credentials.baseRate, 8);
  const perKgRate = asNumber(credentials.perKgRate, 2.5);
  const currency = typeof credentials.currency === 'string' ? credentials.currency : 'GBP';

  return account.serviceLevels.map((level) => ({
    carrier: account.carrier,
    serviceLevel: level.name,
    source: 'EXTERNAL_CARRIER',
    price: Number((baseRate + chargeableWeightKg * perKgRate + Math.max(0, 5 - level.transitDays) * 3).toFixed(2)),
    currency,
    transitDays: level.transitDays,
    chargeableWeightKg,
    surcharges: [],
    metadata: { carrierAccountId: account.id }
  }));
}

export const ratingService = {
  sortQuotes,

  async quote(prisma: PrismaClient, input: RatingInput): Promise<RateQuote> {
    const settings = await prisma.tenantSettings.findUnique({ where: { tenantId: input.tenantId } });
    const divisor = settings?.dimensionalDivisor ?? 5000;
    const volumetricWeightKg = calculateVolumetricWeightKg(input.dimensions, divisor);
    const chargeableWeightKg = calculateChargeableWeightKg(input.weightKg, input.dimensions, divisor);

    const preferredCarriers = [
      ...(input.preferredCarriers ?? []),
      ...configuredPreferredCarriers(settings?.serviceTierConfig)
    ];

    const quotes: CarrierOption[] = [];

    const internal = await pricingService.calculate(prisma, {
      tenantId: input.tenantId,
      serviceTier: input.serviceType,
      weightKg: input.weightKg,
      lengthCm: input.dimensions.lengthCm,
      widthCm: input.dimensions.widthCm,
      heightCm: input.dimensions.heightCm,
      declaredValue: input.declaredValue ?? 0,
      insuranceTier: input.insuranceTier
    });

    if (internal.total > 0) {
      quotes.push({
        carrier: 'Internal Fleet',
        serviceLevel: input.serviceType,
        source: 'INTERNAL_FLEET',
        price: internal.total,
        currency: internal.currency,
        transitDays: undefined,
        chargeableWeightKg: internal.chargeableWeightKg,
        surcharges: internal.breakdown.map((row) => ({
          label: row.label,
          amount: row.amount,
          type: row.appliedRule ? 'RULE' : undefined
        })),
        metadata: {
          subtotal: internal.subtotal,
          taxAmount: internal.taxAmount,
          taxRate: internal.taxRate
        }
      });
    }

    const carrierAccounts = await carrierAccountService.active(prisma, input.tenantId);
    for (const account of carrierAccounts) {
      try {
        quotes.push(...await quoteExternalCarrier(account, input, chargeableWeightKg));
      } catch {
        quotes.push({
          carrier: account.carrier,
          serviceLevel: 'UNAVAILABLE',
          source: 'EXTERNAL_CARRIER',
          price: Number.POSITIVE_INFINITY,
          currency: 'GBP',
          chargeableWeightKg,
          surcharges: [],
          metadata: { carrierAccountId: account.id, unavailable: true }
        });
      }
    }

    const finiteQuotes = quotes.filter((quote) => Number.isFinite(quote.price));
    const fastestTransitDays = Math.min(...finiteQuotes.map((quote) => quote.transitDays ?? 999));
    const rankedQuotes = sortQuotes(
      finiteQuotes.map((quote) => ({
        ...quote,
        isPreferred: preferredCarriers.map(normalizeCarrier).includes(normalizeCarrier(quote.carrier)),
        isFastest: (quote.transitDays ?? 999) === fastestTransitDays
      })),
      preferredCarriers
    );

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const created = await prisma.rateQuote.create({
      data: {
        tenantId: input.tenantId,
        shipmentId: input.shipmentId,
        origin: input.origin as Prisma.InputJsonValue,
        destination: input.destination as Prisma.InputJsonValue,
        weightKg: input.weightKg,
        volumetricWeightKg,
        quotes: rankedQuotes as unknown as Prisma.InputJsonValue,
        isSandbox: input.isSandbox ?? false,
        expiresAt
      }
    });

    return {
      id: created.id,
      tenantId: input.tenantId,
      shipmentId: input.shipmentId ?? null,
      origin: input.origin,
      destination: input.destination,
      weightKg: input.weightKg,
      volumetricWeightKg,
      chargeableWeightKg,
      quotes: rankedQuotes,
      expiresAt: expiresAt.toISOString(),
      createdAt: created.createdAt.toISOString()
    };
  },

  async getQuoteForTenant(prisma: PrismaClient, tenantId: string, quoteId: string) {
    return prisma.rateQuote.findFirst({ where: { id: quoteId, tenantId } });
  },

  enforceNotExpired(quote: { expiresAt: Date }) {
    if (quote.expiresAt <= new Date()) {
      throw new Error('Rate quote has expired');
    }
  }
};
