import { Prisma, type PrismaClient } from '@prisma/client';
import { planService } from '../../modules/tenants/plan.service.js';
import { config } from '../../config/index.js';

// Monthly recurring revenue per tenant (WP-1.2; reused by revenue analytics in WP-3.1). No literals: list prices come
// from planService, discounts from PricingOverride, contract amounts from CustomContract.terms, FX from CurrencyRate.

export type MrrSource = 'plan' | 'contract' | 'none';
/** `convertedFrom`: the amount was converted from this currency with a stored CurrencyRate (flagged in totals). */
export type MrrContribution = { amount: string; currency: string; source: MrrSource; note?: string; convertedFrom?: string };

type MrrTenant = { id: string; status: string; plan: string };
type MrrSubscription = { plan: string; billingCycle: string; status: string } | null;
type MrrDb = Pick<PrismaClient, 'pricingOverride' | 'customContract' | 'currencyRate'>;

const ACTIVE_OVERRIDE_STATUSES = ['ACTIVE', 'APPROVED'];
const ACTIVE_CONTRACT_STATUSES = ['ACTIVE', 'SIGNED'];
const ZERO = new Prisma.Decimal(0);

function zero(currency: string, source: MrrSource, note?: string): MrrContribution {
  return { amount: ZERO.toFixed(2), currency, source, ...(note ? { note } : {}) };
}

/** `terms.monthlyAmount` (major units) + `terms.currency` of a contract, when both are present and valid. */
function contractMonthly(terms: Prisma.JsonValue): { amount: Prisma.Decimal; currency: string } | null {
  if (!terms || typeof terms !== 'object' || Array.isArray(terms)) return null;
  const record = terms as Record<string, unknown>;
  const raw = record.monthlyAmount;
  const currency = typeof record.currency === 'string' && /^[A-Z]{3}$/.test(record.currency) ? record.currency : null;
  if (!currency || (typeof raw !== 'string' && typeof raw !== 'number')) return null;
  try {
    const amount = new Prisma.Decimal(String(raw));
    return amount.isNegative() ? null : { amount, currency };
  } catch {
    return null;
  }
}

/** Converts major units between currencies with the stored rate (direct or inverse). Null when no rate is known. */
export async function convertCurrency(db: Pick<PrismaClient, 'currencyRate'>, amount: Prisma.Decimal, from: string, to: string) {
  if (from === to) return amount;
  const direct = await db.currencyRate.findUnique({ where: { fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to } } });
  if (direct) return amount.mul(direct.rate);
  const inverse = await db.currencyRate.findUnique({ where: { fromCurrency_toCurrency: { fromCurrency: to, toCurrency: from } } });
  if (inverse && !new Prisma.Decimal(inverse.rate).isZero()) return amount.div(inverse.rate);
  return null;
}

/**
 * MRR contribution of one tenant in the platform base currency: the plan's list price for its billing cycle (annual ÷ 12)
 * minus active PricingOverride discount percentages, replaced by an active CustomContract's monthly amount when one
 * exists. DEMO and CANCELLED tenants contribute 0.
 */
export async function mrrForSubscription(
  db: MrrDb,
  tenant: MrrTenant,
  subscription: MrrSubscription,
  options: { baseCurrency?: string; now?: Date } = {}
): Promise<MrrContribution> {
  const baseCurrency = options.baseCurrency ?? config.billing.baseCurrency;
  const now = options.now ?? new Date();
  if (tenant.status === 'DEMO' || tenant.status === 'CANCELLED') return zero(baseCurrency, 'none');
  if (subscription?.status === 'CANCELLED') return zero(baseCurrency, 'none');

  const contract = await db.customContract.findFirst({
    where: { tenantId: tenant.id, status: { in: ACTIVE_CONTRACT_STATUSES }, termStart: { lte: now }, termEnd: { gte: now } },
    orderBy: { termStart: 'desc' }
  });
  const contractAmount = contract ? contractMonthly(contract.terms) : null;

  let amount: Prisma.Decimal;
  let currency: string;
  let source: MrrSource;
  if (contractAmount) {
    ({ amount, currency } = contractAmount);
    source = 'contract';
  } else {
    const plan = subscription?.plan ?? tenant.plan;
    const price = planService.getPrice(plan);
    if (!price) return zero(baseCurrency, 'none', plan === 'ENTERPRISE' ? 'ENTERPRISE without an active contract amount' : undefined);
    const annual = subscription?.billingCycle?.toUpperCase() === 'ANNUAL' || subscription?.billingCycle?.toUpperCase() === 'YEARLY';
    amount = annual ? new Prisma.Decimal(price.annual).div(12) : new Prisma.Decimal(price.monthly);
    currency = price.currency;
    source = 'plan';

    const overrides = await db.pricingOverride.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ACTIVE_OVERRIDE_STATUSES },
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
        discountPercent: { not: null }
      },
      select: { discountPercent: true }
    });
    const discount = overrides.reduce((sum, row) => sum.add(row.discountPercent ?? ZERO), ZERO);
    const capped = Prisma.Decimal.min(discount, new Prisma.Decimal(100));
    amount = amount.mul(new Prisma.Decimal(100).sub(capped)).div(100);
  }

  const converted = await convertCurrency(db, amount, currency, baseCurrency);
  if (!converted) return { amount: amount.toFixed(2), currency, source, note: `No ${currency}→${baseCurrency} rate; shown in ${currency}` };
  return { amount: converted.toFixed(2), currency: baseCurrency, source, ...(currency !== baseCurrency ? { convertedFrom: currency } : {}) };
}

/**
 * Sum of contributions that are in the base currency. `converted` counts rows that were converted from another
 * currency (included); `unconverted` counts rows with no rate (left out of the total).
 */
export function sumMrr(rows: MrrContribution[], baseCurrency = config.billing.baseCurrency) {
  let total = ZERO;
  let unconverted = 0;
  let converted = 0;
  for (const row of rows) {
    if (row.currency === baseCurrency) {
      total = total.add(row.amount);
      if (row.convertedFrom) converted += 1;
    } else unconverted += 1;
  }
  return { amount: total.toFixed(2), currency: baseCurrency, unconverted, converted };
}
