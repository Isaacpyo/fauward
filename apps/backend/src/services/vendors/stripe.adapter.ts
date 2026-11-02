import { config } from '../../config/index.js';
import { stripeService } from '../../modules/payments/stripe.service.js';
import { vendorCall } from './vendor-error.js';

// Stripe calls used by Phase 4 services. Minor units stay inside stripe.service.ts; this adapter only adds the
// isConfigured() switch and turns SDK failures into VendorError (→ 502 VENDOR_ERROR, degraded).

export const stripeAdapter = {
  vendor: 'stripe' as const,
  envNames: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  isConfigured: () => Boolean(config.stripe.secretKey),
  missingEnv: () => (config.stripe.secretKey ? [] : ['STRIPE_SECRET_KEY']),
  isWebhookConfigured: () => Boolean(config.stripe.secretKey && config.stripe.webhookSecret),

  payInvoice: (stripeInvoiceId: string, idempotencyKey: string) => vendorCall('stripe', () => stripeService.payInvoice({ stripeInvoiceId, idempotencyKey })),
  submitDisputeEvidence: (stripeDisputeId: string, evidence: Record<string, string>, idempotencyKey: string) =>
    vendorCall('stripe', () => stripeService.submitDisputeEvidence({ stripeDisputeId, evidence, idempotencyKey })),
  setCustomerTaxExempt: (customerId: string, exempt: boolean, idempotencyKey: string) =>
    vendorCall('stripe', () => stripeService.setCustomerTaxExempt({ customerId, exempt, idempotencyKey })),
  setTrialEnd: (subscriptionId: string, trialEnd: Date, idempotencyKey: string) => vendorCall('stripe', () => stripeService.setTrialEnd({ subscriptionId, trialEnd, idempotencyKey })),
  ping: () => vendorCall('stripe', () => stripeService.retrieveBalance())
};
