import { randomUUID } from 'crypto';

export type PaymentIntentInput = {
  amountMinor: number;
  currency: string;
  customerId?: string;
  metadata?: Record<string, string>;
};

export const stripeService = {
  async createPaymentIntent(input: PaymentIntentInput) {
    const id = `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const clientSecret = `${id}_secret_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    return {
      id,
      clientSecret,
      amountMinor: input.amountMinor,
      currency: input.currency
    };
  },

  async createCustomer(email: string) {
    return { id: `cus_${randomUUID().replace(/-/g, '').slice(0, 24)}`, email };
  },

  async createSubscription(customerId: string, priceId: string) {
    return {
      id: `sub_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      customerId,
      priceId,
      status: 'active'
    };
  },

  async cancelSubscription(subscriptionId: string) {
    return { id: subscriptionId, status: 'canceled' };
  },

  async handleWebhook(payload: unknown) {
    return payload as Record<string, unknown>;
  }
};
