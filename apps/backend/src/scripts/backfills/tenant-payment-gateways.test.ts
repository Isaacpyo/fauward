import { describe, expect, it, vi } from 'vitest';
import { decryptField, generateFieldEncryptionKey } from '../../services/crypto/field-encryption.js';
import { backfillTenantPaymentGateways, parseLegacyGatewayKey } from './tenant-payment-gateways.js';

// Backfill 0055-tenant-payment-gateways (WP-2.12, S12): plaintext JSON keys become encrypted rows; idempotent.
// Fixture keys are made up; a key without a test prefix stands for a live one.

process.env.FIELD_ENCRYPTION_KEYS = JSON.stringify({ test: generateFieldEncryptionKey() });
process.env.FIELD_ENCRYPTION_ACTIVE_KEY_ID = 'test';

const LEGACY_BARE_KEY = 'legacy-stripe-key-without-test-prefix';

function fixture() {
  const settings = [
    {
      tenantId: 't_json',
      paymentGatewayKey: JSON.stringify({
        activeProvider: 'PAYSTACK',
        providers: {
          STRIPE: { enabled: false, accountId: '', publishableKey: '', secretKey: '' },
          PAYSTACK: { enabled: true, publicKey: 'pk_test_abc', secretKey: 'sk_test_paystack', merchantEmail: 'pay@acme.test' },
          BANK_TRANSFER: { enabled: true, bankName: 'Acme Bank', accountNumber: '12345678', instructions: 'Use the invoice number' }
        }
      }),
      webhookSecret: 'whsec_plain' as string | null
    },
    { tenantId: 't_bare', paymentGatewayKey: LEGACY_BARE_KEY, webhookSecret: null },
    { tenantId: 't_done', paymentGatewayKey: JSON.stringify({ providers: { STRIPE: { enabled: true, secretKey: 'sk_test_existing' } } }), webhookSecret: null }
  ] as Array<{ tenantId: string; paymentGatewayKey: string | null; webhookSecret: string | null }>;
  const gateways: Array<Record<string, unknown>> = [{ tenantId: 't_done', provider: 'STRIPE' }];
  return {
    settings,
    gateways,
    tenantSettings: {
      findMany: vi.fn(async () => settings.filter((row) => row.paymentGatewayKey !== null || row.webhookSecret !== null).map((row) => ({ ...row }))),
      update: vi.fn(async ({ where, data }: { where: { tenantId: string }; data: Record<string, unknown> }) => Object.assign(settings.find((row) => row.tenantId === where.tenantId)!, data))
    },
    tenantPaymentGateway: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) => gateways.filter((row) => row.tenantId === where.tenantId)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => gateways.push(data))
    }
  };
}

describe('backfill 0055-tenant-payment-gateways', () => {
  it('parses the IntegrationsTab JSON and a bare legacy Stripe key', () => {
    expect(parseLegacyGatewayKey(LEGACY_BARE_KEY)).toEqual({ STRIPE: { enabled: true, secretKey: LEGACY_BARE_KEY } });
    expect(Object.keys(parseLegacyGatewayKey(fixture().settings[0].paymentGatewayKey!)!)).toEqual(['STRIPE', 'PAYSTACK', 'BANK_TRANSFER']);
  });

  it('dry run only counts', async () => {
    const prisma = fixture();
    const result = await backfillTenantPaymentGateways(prisma as never, { dryRun: true });
    expect(result).toEqual({ dryRun: true, tenantsWithLegacyKeys: 3, gatewaysCreated: 3, skippedExisting: 1, unparseable: 0, webhookSecretsEncrypted: 1, legacyKeysCleared: 0 });
    expect(prisma.tenantPaymentGateway.create).not.toHaveBeenCalled();
    expect(prisma.tenantSettings.update).not.toHaveBeenCalled();
  });

  it('writes encrypted rows (no plaintext key), keeps existing rows, encrypts webhook secrets, and is idempotent', async () => {
    const prisma = fixture();
    await backfillTenantPaymentGateways(prisma as never, { dryRun: false, clearLegacy: true });
    const paystack = prisma.gateways.find((row) => row.tenantId === 't_json' && row.provider === 'PAYSTACK')!;
    expect(paystack).toMatchObject({ enabled: true, mode: 'TEST', publicKey: 'pk_test_abc', status: 'UNVERIFIED', config: { merchantEmail: 'pay@acme.test' } });
    expect(String(paystack.secretKeyEncrypted)).toMatch(/^v1:/);
    expect(decryptField(String(paystack.secretKeyEncrypted))).toBe('sk_test_paystack');
    expect(JSON.stringify(prisma.gateways)).not.toContain('sk_test_paystack');
    expect(prisma.gateways.find((row) => row.provider === 'BANK_TRANSFER')).toMatchObject({ status: 'VERIFIED', config: { bankName: 'Acme Bank', accountNumber: '12345678', instructions: 'Use the invoice number' } });
    expect(prisma.gateways.find((row) => row.tenantId === 't_bare')).toMatchObject({ provider: 'STRIPE', mode: 'LIVE', enabled: true });
    expect(prisma.gateways.filter((row) => row.tenantId === 't_done')).toHaveLength(1);
    expect(prisma.settings[0].webhookSecret).toMatch(/^v1:/);
    expect(prisma.settings.every((row) => row.paymentGatewayKey === null)).toBe(true);

    const again = await backfillTenantPaymentGateways(prisma as never, { dryRun: false });
    expect(again).toMatchObject({ tenantsWithLegacyKeys: 0, gatewaysCreated: 0, webhookSecretsEncrypted: 0 });
  });
});
