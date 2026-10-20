import Stripe from 'stripe';
import { Buffer } from 'node:buffer';

import { config } from '../../config/index.js';

export type PaymentIntentInput = {
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  customerId?: string;
  metadata?: Record<string, string>;
};

// ISO 4217 currencies whose minor unit is not 1/100 (Stripe's zero- and three-decimal lists).
const ZERO_DECIMAL_CURRENCIES = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

export function currencyDecimals(currency: string) {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export class MoneyFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyFormatError';
  }
}

/** "12.34" GBP → 1234; "1500" JPY → 1500; "1.234" KWD → 1234. Exact string arithmetic, no floating point. */
export function toMinorUnits(amountMajor: string, currency: string): number {
  const decimals = currencyDecimals(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amountMajor.trim());
  if (!match) throw new MoneyFormatError(`Invalid amount "${amountMajor}"`);
  const [, whole, fraction = ''] = match;
  const trimmed = fraction.replace(/0+$/, '');
  if (trimmed.length > decimals) throw new MoneyFormatError(`${currency.toUpperCase()} amounts have at most ${decimals} decimal places`);
  const minor = Number(`${whole}${fraction.padEnd(decimals, '0').slice(0, decimals)}`);
  if (!Number.isSafeInteger(minor)) throw new MoneyFormatError(`Amount "${amountMajor}" is too large`);
  return minor;
}

/** 1234 GBP → "12.34"; 1500 JPY → "1500"; 1234 KWD → "1.234". Exact integer arithmetic. */
export function fromMinorUnits(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new MoneyFormatError(`Invalid minor amount ${minor}`);
  const decimals = currencyDecimals(currency);
  const sign = minor < 0 ? '-' : '';
  const digits = String(Math.abs(minor)).padStart(decimals + 1, '0');
  return decimals === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

let stripeClient: Stripe | null = null;

function getStripeClient() {
  if (!config.stripe.secretKey) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY or STRIPE_API_KEY.');
  }

  stripeClient ??= new Stripe(config.stripe.secretKey, {
    apiVersion: '2026-04-22.dahlia'
  });

  return stripeClient;
}

export const stripeService = {
  async createPaymentIntent(input: PaymentIntentInput) {
    const stripe = getStripeClient();
    const params: Stripe.PaymentIntentCreateParams = {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      customer: input.customerId,
      metadata: input.metadata ?? {}
    };
    const intent = await stripe.paymentIntents.create(params, { idempotencyKey: input.idempotencyKey });

    return {
      id: intent.id,
      clientSecret: intent.client_secret ?? '',
      amountMinor: intent.amount,
      currency: intent.currency
    };
  },

  async createCustomer(email: string) {
    const stripe = getStripeClient();
    const customer = await stripe.customers.create({ email });
    return { id: customer.id, email };
  },

  async createSubscription(customerId: string, priceId: string) {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });

    return {
      id: subscription.id,
      customerId,
      priceId,
      status: subscription.status
    };
  },

  async cancelSubscription(subscriptionId: string) {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    return { id: subscription.id, status: subscription.status };
  },

  /** Tenant close (WP-1.2): stop renewing, keep the paid period. */
  async cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    return { id: subscription.id, status: subscription.status, cancelAtPeriodEnd: subscription.cancel_at_period_end };
  },

  isConfigured() {
    return Boolean(config.stripe.secretKey);
  },

  /** Refund in major units (Decimal string); the only place major → minor conversion happens is toMinorUnits (D4). */
  async createRefund(input: { paymentIntentOrCharge: string; amountMajor: string; currency: string; reason?: string; idempotencyKey: string }) {
    const stripe = getStripeClient();
    const target = input.paymentIntentOrCharge.startsWith('ch_') ? { charge: input.paymentIntentOrCharge } : { payment_intent: input.paymentIntentOrCharge };
    const params: Stripe.RefundCreateParams = {
      ...target,
      amount: toMinorUnits(input.amountMajor, input.currency),
      metadata: input.reason ? { reason: input.reason, idempotencyKey: input.idempotencyKey } : { idempotencyKey: input.idempotencyKey }
    };
    const refund = await stripe.refunds.create(params, { idempotencyKey: input.idempotencyKey });
    return { id: refund.id, status: refund.status ?? 'pending' };
  },

  async createCheckoutSession(params: {
    amountPence: number;
    currency: string;
    description: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; url: string }> {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: params.currency.toLowerCase(),
          product_data: { name: params.description },
          unit_amount: params.amountPence,
        },
        quantity: 1,
      }],
      metadata: params.metadata,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });
    return { sessionId: session.id, url: session.url ?? '' };
  },

  async handleWebhook(payload: Buffer, signature: string) {
    const stripe = getStripeClient();
    if (!config.stripe.webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    return stripe.webhooks.constructEvent(payload, signature, config.stripe.webhookSecret);
  },

  async listPayoutBalanceTransactions(payoutId: string) {
    const stripe = getStripeClient();
    const results: Stripe.BalanceTransaction[] = [];
    for await (const txn of stripe.balanceTransactions.list({ payout: payoutId, expand: ['data.source'], limit: 100 })) {
      results.push(txn);
    }
    return results;
  },

  /** Plan change for a tenant without a Stripe subscription yet (WP-2.7): a subscription-mode Checkout session. */
  async createSubscriptionCheckout(params: { customerId?: string | null; customerEmail?: string | null; priceId: string; metadata: Record<string, string>; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: params.priceId, quantity: 1 }],
        ...(params.customerId ? { customer: params.customerId } : params.customerEmail ? { customer_email: params.customerEmail } : {}),
        metadata: params.metadata,
        subscription_data: { metadata: params.metadata },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl
      },
      { idempotencyKey: params.idempotencyKey }
    );
    return { sessionId: session.id, url: session.url ?? '' };
  },

  /** Plan change on an existing Stripe subscription: swaps the price with proration (WP-2.7). */
  async changeSubscriptionPrice(params: { subscriptionId: string; priceId: string; metadata: Record<string, string>; idempotencyKey: string }) {
    const stripe = getStripeClient();
    const current = await stripe.subscriptions.retrieve(params.subscriptionId);
    const item = current.items.data[0];
    if (!item) throw new Error(`Stripe subscription ${params.subscriptionId} has no items`);
    const updated = await stripe.subscriptions.update(
      params.subscriptionId,
      { items: [{ id: item.id, price: params.priceId }], proration_behavior: 'create_prorations', metadata: params.metadata },
      { idempotencyKey: params.idempotencyKey }
    );
    return { id: updated.id, status: updated.status };
  },

  async createBillingPortalSession(params: { customerId: string; returnUrl: string }) {
    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({ customer: params.customerId, return_url: params.returnUrl });
    return { url: session.url };
  },

  /** Save offer redemption (WP-2.7): a one-off amount-off coupon applied to the tenant's subscription. */
  async applyAmountOffCoupon(params: { subscriptionId: string; amountMajor: string; currency: string; name: string; idempotencyKey: string }) {
    const stripe = getStripeClient();
    const coupon = await stripe.coupons.create(
      { amount_off: toMinorUnits(params.amountMajor, params.currency), currency: params.currency.toLowerCase(), duration: 'once', name: params.name },
      { idempotencyKey: `${params.idempotencyKey}:coupon` }
    );
    await stripe.subscriptions.update(params.subscriptionId, { discounts: [{ coupon: coupon.id }] }, { idempotencyKey: `${params.idempotencyKey}:apply` });
    return { couponId: coupon.id };
  },

  /** Dunning retry (WP-4.5): asks Stripe to collect an open invoice now. */
  async payInvoice(params: { stripeInvoiceId: string; idempotencyKey: string }) {
    const stripe = getStripeClient();
    const invoice = await stripe.invoices.pay(params.stripeInvoiceId, {}, { idempotencyKey: params.idempotencyKey });
    return { id: invoice.id ?? params.stripeInvoiceId, status: invoice.status ?? 'unknown' };
  },

  /** Dispute evidence (WP-4.6): updates the dispute's evidence and submits it. */
  async submitDisputeEvidence(params: { stripeDisputeId: string; evidence: Record<string, string>; idempotencyKey: string }) {
    const stripe = getStripeClient();
    const dispute = await stripe.disputes.update(params.stripeDisputeId, { evidence: params.evidence, submit: true }, { idempotencyKey: params.idempotencyKey });
    return { id: dispute.id, status: dispute.status };
  },

  /** Tax exemption (WP-4.7): mirrors Tenant.taxExempt onto the Stripe customer. */
  async setCustomerTaxExempt(params: { customerId: string; exempt: boolean; idempotencyKey: string }) {
    const stripe = getStripeClient();
    const customer = await stripe.customers.update(params.customerId, { tax_exempt: params.exempt ? 'exempt' : 'none' }, { idempotencyKey: params.idempotencyKey });
    return { id: customer.id, taxExempt: customer.tax_exempt ?? null };
  },

  /** Trial extension (WP-4.14): moves the subscription's trial end. */
  async setTrialEnd(params: { subscriptionId: string; trialEnd: Date; idempotencyKey: string }) {
    const stripe = getStripeClient();
    const updated = await stripe.subscriptions.update(
      params.subscriptionId,
      { trial_end: Math.floor(params.trialEnd.getTime() / 1000), proration_behavior: 'none' },
      { idempotencyKey: params.idempotencyKey }
    );
    return { id: updated.id, status: updated.status };
  },

  /** Integration health poll (WP-4.3): the cheapest authenticated call. */
  async retrieveBalance() {
    const stripe = getStripeClient();
    const balance = await stripe.balance.retrieve();
    return { livemode: balance.livemode };
  },

  /** Stripe Tax rate lookup (WP-4.7, optional): tax on one line for an address. Amount in major units. */
  async calculateTax(params: { amountMajor: string; currency: string; country: string; postalCode?: string }) {
    const stripe = getStripeClient();
    const calculation = await stripe.tax.calculations.create({
      currency: params.currency.toLowerCase(),
      line_items: [{ amount: toMinorUnits(params.amountMajor, params.currency), reference: 'rate-lookup' }],
      customer_details: { address: { country: params.country, ...(params.postalCode ? { postal_code: params.postalCode } : {}) }, address_source: 'billing' }
    });
    return { taxAmount: fromMinorUnits(calculation.tax_amount_exclusive, params.currency), currency: params.currency.toUpperCase() };
  }
};
