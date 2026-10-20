// Tenant regions (L5, WP-2.6). `Tenant.region` holds one of these keys; the tenant portal derives the payment
// providers it offers from the region (settings → Integrations), so applying a region change is a single column write.

export type RegionConfig = { key: string; label: string; paymentProviders: string[] };

export const REGIONS: RegionConfig[] = [
  { key: 'uk_europe', label: 'UK & Europe', paymentProviders: ['Stripe', 'Bank transfer'] },
  { key: 'europe', label: 'Europe', paymentProviders: ['Stripe', 'Bank transfer'] },
  { key: 'africa', label: 'Africa', paymentProviders: ['Paystack', 'Flutterwave', 'Bank transfer', 'COD'] },
  { key: 'northAmerica', label: 'North America', paymentProviders: ['Stripe', 'Bank transfer'] },
  { key: 'global', label: 'Global', paymentProviders: ['Stripe', 'Paystack', 'Flutterwave', 'Bank transfer', 'COD'] }
];

export const REGION_KEYS = REGIONS.map((region) => region.key);

export function regionLabel(key: string) {
  return REGIONS.find((region) => region.key === key)?.label ?? key;
}
