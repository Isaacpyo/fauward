import type { PrismaClient, PromoType, PricingRuleAction, SurchargeCondition, SurchargeType } from '@prisma/client';

type PricingInput = {
  tenantId: string;
  originZoneId?: string;
  destZoneId?: string;
  serviceTier: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  declaredValue: number;
  insuranceTier?: string;
  promoCode?: string;
  customerId?: string;
  at?: Date;
};

type BreakdownRow = {
  label: string;
  amount: number;
  appliedRule?: string;
};

function asNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundTo(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function parseSettingsJson(settings: unknown): Record<string, any> {
  if (!settings) return {};
  if (typeof settings === 'object') return settings as Record<string, any>;
  return {};
}

function matchesSurchargeCondition(
  condition: SurchargeCondition,
  threshold: number,
  input: PricingInput,
  context: { isRemoteArea: boolean; isResidential: boolean; isDangerousGoods: boolean }
) {
  switch (condition) {
    case 'ALWAYS':
    case 'FUEL':
      return true;
    case 'OVERSIZE':
      return Math.max(input.lengthCm, input.widthCm, input.heightCm) > threshold;
    case 'OVERWEIGHT':
      return input.weightKg > threshold;
    case 'REMOTE_AREA':
      return context.isRemoteArea;
    case 'RESIDENTIAL':
      return context.isResidential;
    case 'DANGEROUS_GOODS':
      return context.isDangerousGoods;
    case 'PEAK_SEASON':
      return true;
    default:
      return false;
  }
}

function applySurcharge(type: SurchargeType, value: number, base: number, running: number, chargeableWeight: number) {
  switch (type) {
    case 'PERCENT_OF_BASE':
      return base * (value / 100);
    case 'PERCENT_OF_TOTAL':
      return running * (value / 100);
    case 'FLAT_FEE':
      return value;
    case 'PER_KG':
      return chargeableWeight * value;
    default:
      return 0;
  }
}

function ruleMatches(conditions: Record<string, any>, input: PricingInput, date: Date) {
  if (conditions.serviceTiers && Array.isArray(conditions.serviceTiers) && !conditions.serviceTiers.includes(input.serviceTier)) {
    return false;
  }
  if (conditions.originZoneIds && Array.isArray(conditions.originZoneIds) && input.originZoneId && !conditions.originZoneIds.includes(input.originZoneId)) {
    return false;
  }
  if (conditions.destZoneIds && Array.isArray(conditions.destZoneIds) && input.destZoneId && !conditions.destZoneIds.includes(input.destZoneId)) {
    return false;
  }
  if (conditions.weightMinKg && input.weightKg < Number(conditions.weightMinKg)) return false;
  if (conditions.weightMaxKg && input.weightKg > Number(conditions.weightMaxKg)) return false;
  if (conditions.customerIds && Array.isArray(conditions.customerIds) && input.customerId && !conditions.customerIds.includes(input.customerId)) {
    return false;
  }
  if (conditions.daysOfWeek && Array.isArray(conditions.daysOfWeek) && !conditions.daysOfWeek.includes(date.getUTCDay())) {
    return false;
  }
  return true;
}

function applyRuleAction(
  action: PricingRuleAction,
  actionValue: number,
  currentTotal: number
): { next: number; delta: number } {
  switch (action) {
    case 'ADD':
      return { next: currentTotal + actionValue, delta: actionValue };
    case 'SUBTRACT': {
      const next = Math.max(0, currentTotal - actionValue);
      return { next, delta: next - currentTotal };
    }
    case 'MULTIPLY': {
      const next = currentTotal * actionValue;
      return { next, delta: next - currentTotal };
    }
    case 'OVERRIDE_TOTAL':
      return { next: actionValue, delta: actionValue - currentTotal };
    case 'SET_MIN': {
      const next = Math.max(currentTotal, actionValue);
      return { next, delta: next - currentTotal };
    }
    case 'SET_MAX': {
      const next = Math.min(currentTotal, actionValue);
      return { next, delta: next - currentTotal };
    }
    case 'OVERRIDE_PER_KG':
      return { next: currentTotal, delta: 0 };
    default:
      return { next: currentTotal, delta: 0 };
  }
}

function applyPromo(promoType: PromoType, promoValue: number, currentTotal: number, insuranceAmount: number) {
  switch (promoType) {
    case 'PERCENT_OFF':
      return Math.min(currentTotal, currentTotal * (promoValue / 100));
    case 'FIXED_OFF':
      return Math.min(currentTotal, promoValue);
    case 'FREE_INSURANCE':
      return Math.min(currentTotal, insuranceAmount);
    case 'FREE_EXPRESS':
      return 0;
    default:
      return 0;
  }
}

export const pricingService = {
  async calculate(prisma: PrismaClient, input: PricingInput) {
    const now = input.at ?? new Date();
    const settings = await prisma.tenantSettings.findUnique({ where: { tenantId: input.tenantId } });
    const dimDivisor = settings?.dimensionalDivisor ?? 5000;
    const volumetricKg = (input.lengthCm * input.widthCm * input.heightCm) / dimDivisor;
    const chargeableWeightKg = Math.max(input.weightKg, volumetricKg);
    const rows: BreakdownRow[] = [];

    const rateCard = await prisma.rateCard.findFirst({
      where: {
        tenantId: input.tenantId,
        originZoneId: input.originZoneId,
        destZoneId: input.destZoneId,
        serviceTier: input.serviceTier,
        isActive: true
      },
      orderBy: { effectiveFrom: 'desc' }
    });

    const baseFee = rateCard ? asNumber(rateCard.basePrice) : 0;
    const perKgRate = rateCard ? asNumber(rateCard.pricePerKg) : 0;
    const weightAmount = chargeableWeightKg * perKgRate;
    let running = baseFee + weightAmount;

    if (rateCard?.minCharge) running = Math.max(running, asNumber(rateCard.minCharge));
    if (rateCard?.maxCharge) running = Math.min(running, asNumber(rateCard.maxCharge));

    if (baseFee > 0) rows.push({ label: 'Base fee', amount: roundTo(baseFee) });
    rows.push({
      label: `Weight charge (${roundTo(chargeableWeightKg)} kg @ ${roundTo(perKgRate)})`,
      amount: roundTo(weightAmount)
    });

    const tierConfig = parseSettingsJson(settings?.serviceTierConfig);
    const tierMultiplier = asNumber(tierConfig?.[input.serviceTier]?.multiplier) || 1;
    if (tierMultiplier !== 1) {
      const before = running;
      running = running * tierMultiplier;
      rows.push({
        label: `${input.serviceTier} multiplier (${tierMultiplier}x)`,
        amount: roundTo(running - before)
      });
    }

    const surcharges = await prisma.surcharge.findMany({
      where: { tenantId: input.tenantId, isEnabled: true },
      orderBy: [{ condition: 'asc' }, { name: 'asc' }]
    });
    for (const surcharge of surcharges) {
      if (
        !matchesSurchargeCondition(surcharge.condition, asNumber(surcharge.threshold), input, {
          isRemoteArea: false,
          isResidential: false,
          isDangerousGoods: false
        })
      ) {
        continue;
      }
      if (surcharge.condition === 'PEAK_SEASON' && surcharge.peakFrom && surcharge.peakTo) {
        if (now < surcharge.peakFrom || now > surcharge.peakTo) continue;
      }
      const added = applySurcharge(surcharge.type, asNumber(surcharge.value), baseFee + weightAmount, running, chargeableWeightKg);
      running += added;
      rows.push({ label: surcharge.name, amount: roundTo(added) });
    }

    let insuranceAmount = 0;
    const insuranceConfig = parseSettingsJson(settings?.insuranceConfig);
    const tiers: Array<Record<string, any>> = Array.isArray(insuranceConfig?.tiers) ? insuranceConfig.tiers : [];
    const selectedTier = tiers.find((tier) => tier.key === input.insuranceTier && tier.enabled);
    if (selectedTier) {
      if (selectedTier.type === 'PERCENT_OF_DECLARED') {
        insuranceAmount = Math.max((input.declaredValue * asNumber(selectedTier.rate)) / 100, asNumber(selectedTier.minFee));
      } else if (selectedTier.type === 'FLAT_FEE') {
        insuranceAmount = asNumber(selectedTier.rate);
      }
    }
    if (insuranceAmount > 0) {
      running += insuranceAmount;
      rows.push({ label: `${selectedTier?.label ?? 'Insurance'} cover`, amount: roundTo(insuranceAmount) });
    }

    const discountTiers = await prisma.weightDiscountTier.findMany({
      where: { tenantId: input.tenantId, isEnabled: true },
      orderBy: { minWeightKg: 'asc' }
    });
    const matches = discountTiers.filter((tier) => {
      const min = asNumber(tier.minWeightKg);
      const max = tier.maxWeightKg ? asNumber(tier.maxWeightKg) : Infinity;
      return chargeableWeightKg >= min && chargeableWeightKg <= max;
    });
    if (matches.length > 0) {
      const tier = matches.sort((a, b) => asNumber(b.discountValue) - asNumber(a.discountValue))[0];
      let discount = 0;
      if (tier.discountType === 'PERCENT') {
        discount = running * (asNumber(tier.discountValue) / 100);
      } else if (tier.discountType === 'FLAT_FEE_REDUCTION') {
        discount = asNumber(tier.discountValue);
      } else if (tier.discountType === 'FIXED_PER_KG_OVERRIDE') {
        const newWeightAmount = chargeableWeightKg * asNumber(tier.discountValue);
        discount = Math.max(0, weightAmount - newWeightAmount);
      }
      running = Math.max(0, running - discount);
      rows.push({ label: tier.name ?? 'Weight discount tier', amount: roundTo(-discount) });
    }

    const rules = await prisma.pricingRule.findMany({
      where: { tenantId: input.tenantId, isEnabled: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
    });

    for (const rule of rules) {
      const conditions = parseSettingsJson(rule.conditions);
      if (!ruleMatches(conditions, input, now)) continue;
      const { next, delta } = applyRuleAction(rule.action, asNumber(rule.actionValue), running);
      running = next;
      if (delta !== 0) {
        rows.push({ label: rule.name, amount: roundTo(delta), appliedRule: rule.name });
      }
      if (rule.stopAfter) break;
    }

    let promoDiscount = 0;
    if (input.promoCode) {
      const promo = await prisma.promoCode.findFirst({
        where: { tenantId: input.tenantId, code: input.promoCode.toUpperCase(), isEnabled: true }
      });
      if (promo) {
        promoDiscount = applyPromo(promo.type, asNumber(promo.value), running, insuranceAmount);
        if (promo.maxDiscountValue) promoDiscount = Math.min(promoDiscount, asNumber(promo.maxDiscountValue));
        if (promo.minOrderValue && running < asNumber(promo.minOrderValue)) promoDiscount = 0;
        running = Math.max(0, running - promoDiscount);
        if (promoDiscount > 0) {
          rows.push({ label: `Promo: ${promo.code}`, amount: roundTo(-promoDiscount) });
        }
      }
    }

    const taxConfig = parseSettingsJson(settings?.taxConfig);
    const taxRate = taxConfig?.enabled ? asNumber(taxConfig.rate) : 0;
    const subtotal = running;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    return {
      chargeableWeightKg: roundTo(chargeableWeightKg),
      breakdown: rows,
      subtotal: roundTo(subtotal),
      taxRate: roundTo(taxRate),
      taxAmount: roundTo(taxAmount),
      total: roundTo(total),
      currency: rateCard?.currency ?? settings?.currency ?? 'GBP',
      quoteExpiresAt: new Date(now.getTime() + (settings?.quoteValidityMinutes ?? 30) * 60 * 1000).toISOString()
    };
  }
};

