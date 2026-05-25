import type { Tenant } from "@fauward/tenant-db";

export type TextDirection = "ltr" | "rtl";
export type OtpChannel = "sms" | "email" | "whatsapp";

export type CountryOption = {
  iso2: string;
  name: string;
  dialCode: string;
};

export type CorridorConfig = {
  id: string;
  originCountry: string;
  destinationCountry: string;
  direction: string;
  route: string;
  customsRequired: boolean;
};

export type SupportedLanguage = {
  locale: string;
  label: string;
  textDirection: TextDirection;
};

export type PaymentGatewayConfig = {
  provider: string;
  publishableKey: string | null;
  status: "ready" | "unsupported" | "missing_credentials";
};

export type TaxRuleConfig = {
  enabled: boolean;
  label: string;
  rate: number;
  included: boolean;
};

export type CategoryRule = {
  key: string;
  label: string;
  status: "allowed" | "restricted" | "blocked";
  message?: string;
};

export type InsuranceTierConfig = {
  key: string;
  label: string;
  type: "NONE" | "PERCENT_OF_DECLARED" | "FLAT_FEE";
  rate: number;
  minFee: number;
  enabled: boolean;
};

export type PricingConfig = {
  dimensionalDivisor: number;
  fallbackPerKgRate: number;
  insuranceTiers: InsuranceTierConfig[];
};

export type TenantConfig = {
  tenantId: string | null;
  tenantSlug: string | null;
  regionKey: string;
  enabledCountries: CountryOption[];
  corridors: CorridorConfig[];
  currency: string;
  supportedCurrencies: string[];
  locale: string;
  supportedLanguages: SupportedLanguage[];
  textDirection: TextDirection;
  paymentGateway: PaymentGatewayConfig;
  taxRule: TaxRuleConfig | null;
  allowedCategories: CategoryRule[];
  customsRequired: boolean;
  customsSystemLabel: string | null;
  otpChannel: OtpChannel;
  pricing: PricingConfig;
};

type JsonRecord = Record<string, unknown>;

type RegionProfileDefaults = {
  regionKey: string;
  countries: string[];
  currencies: string[];
  locale: string;
  languages: SupportedLanguage[];
  gateways: string[];
  taxRule: TaxRuleConfig | null;
  customsSystemLabel: string | null;
  otpChannel: OtpChannel;
  fallbackPerKgRate: number;
  categories?: CategoryRule[];
};

export const COUNTRIES: CountryOption[] = [
  { iso2: "GB", name: "United Kingdom", dialCode: "44" },
  { iso2: "IE", name: "Ireland", dialCode: "353" },
  { iso2: "FR", name: "France", dialCode: "33" },
  { iso2: "DE", name: "Germany", dialCode: "49" },
  { iso2: "ES", name: "Spain", dialCode: "34" },
  { iso2: "NL", name: "Netherlands", dialCode: "31" },
  { iso2: "CH", name: "Switzerland", dialCode: "41" },
  { iso2: "NG", name: "Nigeria", dialCode: "234" },
  { iso2: "GH", name: "Ghana", dialCode: "233" },
  { iso2: "CI", name: "Cote d'Ivoire", dialCode: "225" },
  { iso2: "SN", name: "Senegal", dialCode: "221" },
  { iso2: "KE", name: "Kenya", dialCode: "254" },
  { iso2: "UG", name: "Uganda", dialCode: "256" },
  { iso2: "TZ", name: "Tanzania", dialCode: "255" },
  { iso2: "RW", name: "Rwanda", dialCode: "250" },
  { iso2: "ZA", name: "South Africa", dialCode: "27" },
  { iso2: "ZM", name: "Zambia", dialCode: "260" },
  { iso2: "ZW", name: "Zimbabwe", dialCode: "263" },
  { iso2: "AE", name: "United Arab Emirates", dialCode: "971" },
  { iso2: "SA", name: "Saudi Arabia", dialCode: "966" },
  { iso2: "EG", name: "Egypt", dialCode: "20" },
  { iso2: "MA", name: "Morocco", dialCode: "212" },
  { iso2: "US", name: "United States", dialCode: "1" },
  { iso2: "CA", name: "Canada", dialCode: "1" },
  { iso2: "IN", name: "India", dialCode: "91" },
  { iso2: "AU", name: "Australia", dialCode: "61" },
  { iso2: "SG", name: "Singapore", dialCode: "65" },
];

const BASE_CATEGORIES: CategoryRule[] = [
  { key: "documents", label: "Documents", status: "allowed" },
  { key: "clothing", label: "Clothing", status: "allowed" },
  { key: "electronics", label: "Electronics", status: "allowed" },
  { key: "food", label: "Food (non-perishable)", status: "restricted", message: "Food shipments may require import documentation." },
  { key: "cosmetics", label: "Cosmetics", status: "restricted", message: "Cosmetics may require product and ingredient declarations." },
  { key: "household", label: "Household goods", status: "allowed" },
  { key: "medicine", label: "Medicine or healthcare", status: "blocked", message: "Regulated healthcare goods cannot be booked in this widget." },
  { key: "dangerous_goods", label: "Dangerous goods", status: "blocked", message: "Dangerous goods require an operator-assisted booking." },
  { key: "other", label: "Other", status: "restricted", message: "The operator may request more detail before collection." },
];

const REGION_PROFILES: Record<string, RegionProfileDefaults> = {
  uk_europe: {
    regionKey: "uk_europe",
    countries: ["GB", "IE", "FR", "DE", "ES", "NL", "CH"],
    currencies: ["GBP", "EUR", "CHF"],
    locale: "en-GB",
    languages: [
      { locale: "en-GB", label: "English", textDirection: "ltr" },
      { locale: "fr-FR", label: "Francais", textDirection: "ltr" },
      { locale: "de-DE", label: "Deutsch", textDirection: "ltr" },
    ],
    gateways: ["STRIPE"],
    taxRule: { enabled: true, label: "VAT", rate: 20, included: false },
    customsSystemLabel: "CDS / AES",
    otpChannel: "sms",
    fallbackPerKgRate: 7,
  },
  west_africa: {
    regionKey: "west_africa",
    countries: ["NG", "GH", "CI", "SN", "GB"],
    currencies: ["NGN", "GHS", "XOF", "GBP"],
    locale: "en-NG",
    languages: [
      { locale: "en-NG", label: "English", textDirection: "ltr" },
      { locale: "fr-FR", label: "Francais", textDirection: "ltr" },
    ],
    gateways: ["PAYSTACK", "FLUTTERWAVE", "STRIPE"],
    taxRule: { enabled: true, label: "VAT", rate: 7.5, included: false },
    customsSystemLabel: "NICIS II / GCNET",
    otpChannel: "sms",
    fallbackPerKgRate: 2500,
    categories: BASE_CATEGORIES.map((category) =>
      category.key === "electronics"
        ? { ...category, status: "restricted", message: "Electronics may require serial number and customs documentation." }
        : category,
    ),
  },
  east_africa: {
    regionKey: "east_africa",
    countries: ["KE", "UG", "TZ", "RW", "GB"],
    currencies: ["KES", "UGX", "TZS", "RWF", "GBP"],
    locale: "en-KE",
    languages: [
      { locale: "en-KE", label: "English", textDirection: "ltr" },
      { locale: "sw-KE", label: "Kiswahili", textDirection: "ltr" },
    ],
    gateways: ["MPESA", "FLUTTERWAVE", "PESAPAL"],
    taxRule: { enabled: true, label: "VAT", rate: 16, included: false },
    customsSystemLabel: "eTIMS / EAC",
    otpChannel: "sms",
    fallbackPerKgRate: 900,
  },
  southern_africa: {
    regionKey: "southern_africa",
    countries: ["ZA", "ZM", "ZW", "GB"],
    currencies: ["ZAR", "ZMW", "ZWL", "GBP"],
    locale: "en-ZA",
    languages: [
      { locale: "en-ZA", label: "English", textDirection: "ltr" },
      { locale: "af-ZA", label: "Afrikaans", textDirection: "ltr" },
      { locale: "zu-ZA", label: "isiZulu", textDirection: "ltr" },
    ],
    gateways: ["PEACH", "PAYFAST", "OZOW", "STRIPE"],
    taxRule: { enabled: true, label: "VAT", rate: 15, included: false },
    customsSystemLabel: "SARS",
    otpChannel: "sms",
    fallbackPerKgRate: 110,
  },
  mena: {
    regionKey: "mena",
    countries: ["AE", "SA", "EG", "MA", "GB"],
    currencies: ["AED", "SAR", "EGP", "MAD", "GBP", "USD"],
    locale: "ar-AE",
    languages: [
      { locale: "ar-AE", label: "Arabic", textDirection: "rtl" },
      { locale: "en-AE", label: "English", textDirection: "ltr" },
    ],
    gateways: ["STRIPE", "CHECKOUT", "HYPERPAY", "FAWRY", "PAYTABS"],
    taxRule: { enabled: true, label: "VAT", rate: 5, included: false },
    customsSystemLabel: "Mirsal 2 / FASAH / ACID",
    otpChannel: "sms",
    fallbackPerKgRate: 25,
    categories: BASE_CATEGORIES.map((category) =>
      category.key === "other"
        ? { ...category, message: "Provide detailed content descriptions for customs review." }
        : category,
    ),
  },
  north_america: {
    regionKey: "north_america",
    countries: ["US", "CA"],
    currencies: ["USD", "CAD"],
    locale: "en-US",
    languages: [
      { locale: "en-US", label: "English", textDirection: "ltr" },
      { locale: "fr-CA", label: "Francais", textDirection: "ltr" },
    ],
    gateways: ["STRIPE", "SQUARE"],
    taxRule: { enabled: true, label: "Sales tax", rate: 0, included: false },
    customsSystemLabel: "ACE / CERS",
    otpChannel: "sms",
    fallbackPerKgRate: 8,
  },
  asia_pacific: {
    regionKey: "asia_pacific",
    countries: ["IN", "AU", "SG", "AE"],
    currencies: ["INR", "AUD", "SGD", "AED", "USD"],
    locale: "en-SG",
    languages: [{ locale: "en-SG", label: "English", textDirection: "ltr" }],
    gateways: ["RAZORPAY", "STRIPE", "PAYNOW"],
    taxRule: { enabled: true, label: "GST", rate: 9, included: false },
    customsSystemLabel: "Regional customs",
    otpChannel: "sms",
    fallbackPerKgRate: 11,
  },
  global: {
    regionKey: "global",
    countries: ["GB", "NG", "AE", "US", "CA", "IN", "AU", "SG"],
    currencies: ["GBP", "NGN", "AED", "USD", "CAD", "INR", "AUD", "SGD"],
    locale: "en-GB",
    languages: [
      { locale: "en-GB", label: "English", textDirection: "ltr" },
      { locale: "ar-AE", label: "Arabic", textDirection: "rtl" },
      { locale: "fr-FR", label: "Francais", textDirection: "ltr" },
    ],
    gateways: ["STRIPE"],
    taxRule: null,
    customsSystemLabel: "Regional customs",
    otpChannel: "sms",
    fallbackPerKgRate: 7,
  },
};

const DEFAULT_INSURANCE_TIERS: InsuranceTierConfig[] = [
  { key: "NONE", label: "No insurance", type: "NONE", rate: 0, minFee: 0, enabled: true },
  { key: "BASIC", label: "Basic cover", type: "PERCENT_OF_DECLARED", rate: 0.75, minFee: 5, enabled: true },
  { key: "STANDARD", label: "Standard cover", type: "PERCENT_OF_DECLARED", rate: 1, minFee: 5, enabled: true },
  { key: "PREMIUM", label: "Premium cover", type: "PERCENT_OF_DECLARED", rate: 2, minFee: 10, enabled: true },
];

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return asRecord(parsed);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeRegion(region: string | null | undefined): string {
  const key = (region ?? "global").trim().toLowerCase();
  if (key === "uk" || key === "uk_eu" || key === "europe") return "uk_europe";
  if (key === "africa" || key === "west-africa") return "west_africa";
  if (key === "east-africa") return "east_africa";
  if (key === "southern-africa" || key === "south_africa") return "southern_africa";
  if (key === "middle_east" || key === "north_africa" || key === "n_africa_mena" || key === "asia") return "mena";
  if (key === "north-america" || key === "us_canada") return "north_america";
  if (key === "apac" || key === "asia-pacific") return "asia_pacific";
  return REGION_PROFILES[key] ? key : "global";
}

function directionFor(originIso2: string, destinationIso2: string): string {
  if (originIso2 === destinationIso2) return `DOMESTIC_${originIso2}`;
  if (originIso2 === "GB") return "SHIP_TO_AFRICA";
  if (destinationIso2 === "GB") return "SHIP_TO_UK";
  return `SHIP_${originIso2}_TO_${destinationIso2}`;
}

function buildCorridors(countries: CountryOption[]): CorridorConfig[] {
  return countries.flatMap((origin) =>
    countries.map((destination) => ({
      id: `${origin.iso2}-${destination.iso2}`,
      originCountry: origin.name,
      destinationCountry: destination.name,
      direction: directionFor(origin.iso2, destination.iso2),
      route: `${origin.name} to ${destination.name}`,
      customsRequired: origin.iso2 !== destination.iso2,
    })),
  );
}

function countryFromIso(iso2: string): CountryOption | null {
  return COUNTRIES.find((country) => country.iso2 === iso2.toUpperCase()) ?? null;
}

export function countryFromName(name: string): CountryOption | null {
  const normalized = name.trim().toLowerCase();
  return COUNTRIES.find((country) => country.name.toLowerCase() === normalized) ?? null;
}

export function countryIso2(name: string): string | null {
  return countryFromName(name)?.iso2 ?? null;
}

export function displayCountryName(country: string, locale: string): string {
  const option = countryFromName(country);
  if (!option) return country;
  try {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return names.of(option.iso2) ?? option.name;
  } catch {
    return option.name;
  }
}

export function getDialCodeForCountry(country: string): string {
  return countryFromName(country)?.dialCode ?? "44";
}

function textDirectionForLocale(locale: string, tenantIsRtl?: boolean): TextDirection {
  if (tenantIsRtl) return "rtl";
  const lang = locale.toLowerCase().split("-")[0];
  return ["ar", "fa", "he", "ur"].includes(lang) ? "rtl" : "ltr";
}

function normalizeLocale(language: string | null | undefined, fallback: string): string {
  const value = language?.trim();
  if (!value) return fallback;
  if (value.includes("-")) return value;
  const map: Record<string, string> = {
    en: fallback.startsWith("en") ? fallback : "en-GB",
    fr: "fr-FR",
    de: "de-DE",
    es: "es-ES",
    nl: "nl-NL",
    ar: "ar-AE",
    sw: "sw-KE",
    af: "af-ZA",
    zu: "zu-ZA",
  };
  return map[value.toLowerCase()] ?? fallback;
}

function parseTaxRule(settingsTax: unknown, fallback: TaxRuleConfig | null): TaxRuleConfig | null {
  const parsed = asRecord(settingsTax);
  if (!parsed) return fallback;
  if (!asBoolean(parsed.enabled)) return null;
  return {
    enabled: true,
    label: asString(parsed.taxName) ?? asString(parsed.label) ?? fallback?.label ?? "Tax",
    rate: asNumber(parsed.rate),
    included: asBoolean(parsed.taxIncluded),
  };
}

function parseInsuranceTiers(settingsInsurance: unknown): InsuranceTierConfig[] {
  const parsed = asRecord(settingsInsurance);
  const tiers = Array.isArray(parsed?.tiers) ? parsed.tiers : null;
  if (!tiers) return DEFAULT_INSURANCE_TIERS;

  const normalized = tiers
    .map((tier): InsuranceTierConfig | null => {
      const record = asRecord(tier);
      const key = asString(record?.key);
      if (!record || !key) return null;
      const typeRaw = asString(record.type)?.toUpperCase();
      const type =
        typeRaw === "FLAT_FEE" || typeRaw === "NONE" || typeRaw === "PERCENT_OF_DECLARED"
          ? typeRaw
          : "PERCENT_OF_DECLARED";
      return {
        key,
        label: asString(record.label) ?? key,
        type,
        rate: asNumber(record.rate),
        minFee: asNumber(record.minFee),
        enabled: record.enabled !== false,
      };
    })
    .filter((tier): tier is InsuranceTierConfig => tier !== null);

  return normalized.some((tier) => tier.key === "NONE") ? normalized : DEFAULT_INSURANCE_TIERS;
}

function parsePaymentIntegration(
  provider: string,
  paymentGatewayKey: unknown,
): { activeProvider: string | null; publishableKey: string | null } {
  const parsed = asRecord(paymentGatewayKey);
  if (!parsed) {
    const key = asString(paymentGatewayKey);
    return {
      activeProvider: null,
      publishableKey: key?.startsWith("pk_") ? key : null,
    };
  }

  const activeProvider = asString(parsed.activeProvider);
  const providers = asRecord(parsed.providers);
  const providerConfig = asRecord(providers?.[activeProvider ?? provider]) ?? asRecord(providers?.[provider]);
  return {
    activeProvider,
    publishableKey:
      asString(providerConfig?.publishableKey) ??
      asString(providerConfig?.publicKey) ??
      null,
  };
}

function enabledCountriesFor(profile: RegionProfileDefaults): CountryOption[] {
  const countries = profile.countries
    .map(countryFromIso)
    .filter((country): country is CountryOption => country !== null);
  return countries.length > 0 ? countries : [COUNTRIES[0]];
}

export function buildTenantConfig(tenant: Tenant | null | undefined): TenantConfig {
  const regionKey = normalizeRegion(tenant?.region);
  const profile = REGION_PROFILES[regionKey] ?? REGION_PROFILES.global;
  const settings = tenant?.settings ?? null;
  const locale = normalizeLocale(tenant?.defaultLanguage, profile.locale);
  const textDirection = textDirectionForLocale(locale, tenant?.isRtl);
  const currency = settings?.currency ?? tenant?.defaultCurrency ?? profile.currencies[0] ?? "GBP";
  const configuredGateway = (settings?.paymentGateway ?? profile.gateways[0] ?? "STRIPE").toUpperCase();
  const integration = parsePaymentIntegration(configuredGateway, settings?.paymentGatewayKey);
  const provider = (integration.activeProvider ?? configuredGateway).toUpperCase();
  const publishableKey =
    integration.publishableKey ??
    (provider === "STRIPE"
      ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null
      : provider === "PAYSTACK"
        ? process.env.PAYSTACK_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? null
        : null);
  const gatewaySupportedInPhaseA = provider === "STRIPE" || provider === "PAYSTACK";
  const enabledCountries = enabledCountriesFor(profile);
  const corridors = buildCorridors(enabledCountries);
  const taxRule = parseTaxRule(settings?.taxConfig, profile.taxRule);
  const dimensionalDivisor =
    typeof settings?.dimensionalDivisor === "number" && settings.dimensionalDivisor > 0
      ? settings.dimensionalDivisor
      : 5000;

  return {
    tenantId: tenant?.id ?? null,
    tenantSlug: tenant?.slug ?? null,
    regionKey: profile.regionKey,
    enabledCountries,
    corridors,
    currency: currency.toUpperCase(),
    supportedCurrencies: Array.from(new Set([currency.toUpperCase(), ...profile.currencies.map((item) => item.toUpperCase())])),
    locale,
    supportedLanguages: profile.languages.some((item) => item.locale === locale)
      ? profile.languages
      : [{ locale, label: locale, textDirection }, ...profile.languages],
    textDirection,
    paymentGateway: {
      provider,
      publishableKey,
      status: gatewaySupportedInPhaseA ? (publishableKey ? "ready" : "missing_credentials") : "unsupported",
    },
    taxRule,
    allowedCategories: profile.categories ?? BASE_CATEGORIES,
    customsRequired: corridors.some((corridor) => corridor.customsRequired),
    customsSystemLabel: profile.customsSystemLabel,
    otpChannel: tenant?.smsEnabled === false ? "email" : profile.otpChannel,
    pricing: {
      dimensionalDivisor,
      fallbackPerKgRate: profile.fallbackPerKgRate,
      insuranceTiers: parseInsuranceTiers(settings?.insuranceConfig),
    },
  };
}

export const DEFAULT_TENANT_CONFIG = buildTenantConfig(null);
