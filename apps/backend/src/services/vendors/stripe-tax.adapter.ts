import { config } from '../../config/index.js';
import { stripeService } from '../../modules/payments/stripe.service.js';
import { vendorCall } from './vendor-error.js';

// Optional tax-rate lookup for revenue.tax (WP-4.7). Needs Stripe plus STRIPE_TAX_ENABLED=true (Stripe Tax is a paid
// Stripe product that must be switched on in the account). Without it the console uses the registrations' own rates.

function enabled() {
  return process.env.STRIPE_TAX_ENABLED === 'true';
}

export const stripeTaxAdapter = {
  vendor: 'stripe-tax' as const,
  envNames: ['STRIPE_SECRET_KEY', 'STRIPE_TAX_ENABLED'],
  isConfigured: () => Boolean(config.stripe.secretKey) && enabled(),
  missingEnv: () => [...(config.stripe.secretKey ? [] : ['STRIPE_SECRET_KEY']), ...(enabled() ? [] : ['STRIPE_TAX_ENABLED'])],

  lookupTax: (input: { amount: string; currency: string; country: string; postalCode?: string }) =>
    vendorCall('stripe-tax', () => stripeService.calculateTax({ amountMajor: input.amount, currency: input.currency, country: input.country, postalCode: input.postalCode }))
};
