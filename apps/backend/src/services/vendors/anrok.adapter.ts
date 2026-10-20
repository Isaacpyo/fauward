import { fromMinorUnits, toMinorUnits } from '../../modules/payments/stripe.service.js';
import { readVendorEnv, requireVendorEnv, vendorRequest } from './http.js';

// Optional tax-rate lookup for revenue.tax (WP-4.7) through Anrok's ephemeral transaction API. The minor-unit
// conversion uses the helpers that live in stripe.service.ts.

const SPEC = { required: ['ANROK_API_KEY'], optional: { ANROK_BASE_URL: 'https://api.anrok.com' } };

export const anrokAdapter = {
  vendor: 'anrok' as const,
  envNames: ['ANROK_API_KEY'],
  isConfigured: () => readVendorEnv(SPEC).configured,
  missingEnv: () => readVendorEnv(SPEC).missing,

  async lookupTax(input: { amount: string; currency: string; country: string; postalCode?: string }) {
    const values = requireVendorEnv('anrok', SPEC);
    const result = await vendorRequest<{ taxAmountToCollect?: number }>('anrok', `${values.ANROK_BASE_URL}/v1/seller/transactions/createEphemeral`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${values.ANROK_API_KEY}` },
      body: {
        currencyCode: input.currency.toUpperCase(),
        accountingDate: new Date().toISOString().slice(0, 10),
        lineItems: [{ id: 'rate-lookup', productExternalId: 'fauward-subscription', amount: toMinorUnits(input.amount, input.currency) }],
        customerAddress: { country: input.country, ...(input.postalCode ? { postalCode: input.postalCode } : {}) }
      }
    });
    return { taxAmount: fromMinorUnits(result.taxAmountToCollect ?? 0, input.currency), currency: input.currency.toUpperCase() };
  }
};
