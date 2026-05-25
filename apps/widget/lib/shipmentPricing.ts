import type { InsuranceTierConfig, TenantConfig } from "./shipmentTenantConfig";

export type PackageInput = {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
};

export type PricingBreakdown = {
  chargeableWeight: number;
  weightCharge: number;
  insuranceFee: number;
  subtotal: number;
  taxAmount: number;
  total: number;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function chargeableWeight(pkg: PackageInput, config: TenantConfig): number {
  const divisor = config.pricing.dimensionalDivisor > 0 ? config.pricing.dimensionalDivisor : 5000;
  const volumetric = (pkg.lengthCm * pkg.widthCm * pkg.heightCm) / divisor;
  return roundMoney(Math.max(pkg.weightKg, volumetric));
}

export function resolveInsuranceTier(key: string, config: TenantConfig): InsuranceTierConfig {
  return (
    config.pricing.insuranceTiers.find((tier) => tier.key === key && tier.enabled) ??
    config.pricing.insuranceTiers.find((tier) => tier.key === "NONE") ??
    { key: "NONE", label: "No insurance", type: "NONE", rate: 0, minFee: 0, enabled: true }
  );
}

export function insuranceFee(declaredValue: number, insuranceKey: string, config: TenantConfig): number {
  const tier = resolveInsuranceTier(insuranceKey, config);
  if (tier.type === "NONE") return 0;
  if (tier.type === "FLAT_FEE") return roundMoney(tier.rate);
  return roundMoney(Math.max((declaredValue * tier.rate) / 100, tier.minFee));
}

export function calculateShipmentPricing(
  pkg: PackageInput,
  declaredValue: number,
  insuranceKey: string,
  config: TenantConfig,
): PricingBreakdown {
  const cw = chargeableWeight(pkg, config);
  const weightCharge = roundMoney(cw * config.pricing.fallbackPerKgRate);
  const insurance = insuranceFee(declaredValue, insuranceKey, config);
  const subtotal = roundMoney(weightCharge + insurance);
  const taxAmount =
    config.taxRule && config.taxRule.enabled && !config.taxRule.included
      ? roundMoney(subtotal * (config.taxRule.rate / 100))
      : 0;

  return {
    chargeableWeight: cw,
    weightCharge,
    insuranceFee: insurance,
    subtotal,
    taxAmount,
    total: roundMoney(subtotal + taxAmount),
  };
}

export function toMinorUnits(amount: number, currency: string): number {
  const zeroDecimalCurrencies = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
  const multiplier = zeroDecimalCurrencies.has(currency.toUpperCase()) ? 1 : 100;
  return Math.round(amount * multiplier);
}

