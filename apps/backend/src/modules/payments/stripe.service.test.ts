import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('dotenv');
  process.env = { ...originalEnv };
});

describe('stripeService', () => {
  it('does not crash on import when no Stripe key is configured', async () => {
    process.env.STRIPE_SECRET_KEY = '';
    delete process.env.STRIPE_API_KEY;
    vi.doMock('dotenv', () => ({
      default: {
        config: vi.fn()
      }
    }));

    const { stripeService } = await import('./stripe.service.js');

    await expect(stripeService.createCustomer('ops@fauward.com')).rejects.toThrow(
      'Stripe is not configured. Set STRIPE_SECRET_KEY or STRIPE_API_KEY.'
    );
  });

  it('accepts STRIPE_API_KEY as an alias for STRIPE_SECRET_KEY', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_API_KEY = 'sk_test_alias';
    vi.doMock('dotenv', () => ({
      default: {
        config: vi.fn()
      }
    }));

    const { config } = await import('../../config/index.js');

    expect(config.stripe.secretKey).toBe('sk_test_alias');
  });
});
