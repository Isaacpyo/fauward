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
  }
};
