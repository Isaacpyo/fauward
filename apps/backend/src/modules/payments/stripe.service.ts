import Stripe from 'stripe';
import { Buffer } from 'node:buffer';

import { config } from '../../config/index.js';

export type PaymentIntentInput = {
  amountMinor: number;
  currency: string;
  customerId?: string;
  metadata?: Record<string, string>;
};

let stripeClient: Stripe | null = null;

function getStripeClient() {
  if (!config.stripe.secretKey) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY or STRIPE_API_KEY.');
  }

  stripeClient ??= new Stripe(config.stripe.secretKey, {
    apiVersion: '2026-03-25.dahlia'
  });

  return stripeClient;
}

export const stripeService = {
  async createPaymentIntent(input: PaymentIntentInput) {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      customer: input.customerId,
      metadata: input.metadata ?? {}
    });

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

  async handleWebhook(payload: Buffer, signature: string) {
    const stripe = getStripeClient();
    if (!config.stripe.webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    return stripe.webhooks.constructEvent(payload, signature, config.stripe.webhookSecret);
  }
};
