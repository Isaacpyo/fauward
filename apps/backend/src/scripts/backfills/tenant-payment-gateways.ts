import type { Prisma, PrismaClient } from '@prisma/client';
import { encryptField, isEncryptedField } from '../../services/crypto/field-encryption.js';
import { GATEWAY_PROVIDERS, modeForKey, type GatewayProvider } from '../../services/tenant-payment-gateway.service.js';

export type PaymentGatewaysBackfillResult = {
  dryRun: boolean;
  tenantsWithLegacyKeys: number;
  gatewaysCreated: number;
  skippedExisting: number;
  unparseable: number;
  webhookSecretsEncrypted: number;
  legacyKeysCleared: number;
};

type LegacyProvider = {
  enabled?: boolean;
  accountId?: string | null;
  publicKey?: string | null;
  publishableKey?: string | null;
  secretKey?: string | null;
  webhookSecret?: string | null;
  encryptionKey?: string | null;
  merchantEmail?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  sortCode?: string | null;
  iban?: string | null;
  instructions?: string | null;
  remittanceWindowDays?: number | null;
};

const CONFIG_KEYS: Record<GatewayProvider, Array<keyof LegacyProvider>> = {
  STRIPE: ['accountId'],
  PAYSTACK: ['merchantEmail'],
  FLUTTERWAVE: [],
  BANK_TRANSFER: ['bankName', 'accountName', 'accountNumber', 'sortCode', 'iban', 'instructions'],
  COD: ['remittanceWindowDays', 'instructions']
};

/** The legacy value is the IntegrationsTab JSON (`{ activeProvider, providers }`) or, older still, a bare Stripe key. */
export function parseLegacyGatewayKey(raw: string): Partial<Record<GatewayProvider, LegacyProvider>> | null {
  try {
    const parsed = JSON.parse(raw) as { providers?: Partial<Record<string, LegacyProvider>> };
    if (!parsed || typeof parsed !== 'object') return null;
    const providers: Partial<Record<GatewayProvider, LegacyProvider>> = {};
    for (const provider of GATEWAY_PROVIDERS) {
      const value = parsed.providers?.[provider];
      if (value && typeof value === 'object') providers[provider] = value;
    }
    return providers;
  } catch {
    const key = raw.trim();
    return key ? { STRIPE: { enabled: true, secretKey: key } } : null;
  }
}

function hasContent(provider: GatewayProvider, value: LegacyProvider) {
  return Boolean(value.enabled || value.secretKey || value.publicKey || value.publishableKey || CONFIG_KEYS[provider].some((key) => value[key] !== undefined && value[key] !== null && value[key] !== ''));
}

function rowFor(tenantId: string, provider: GatewayProvider, value: LegacyProvider): Prisma.TenantPaymentGatewayUncheckedCreateInput {
  const config: Record<string, string | number> = {};
  for (const key of CONFIG_KEYS[provider]) {
    const item = value[key];
    if (typeof item === 'string' && item.trim()) config[key] = item.trim();
    if (typeof item === 'number') config[key] = item;
  }
  const secretKey = value.secretKey?.trim() || null;
  const enabled = Boolean(value.enabled);
  return {
    tenantId,
    provider,
    enabled,
    mode: modeForKey(provider, secretKey),
    publicKey: (value.publishableKey ?? value.publicKey)?.trim() || null,
    secretKeyEncrypted: secretKey ? encryptField(secretKey) : null,
    webhookSecretEncrypted: value.webhookSecret?.trim() ? encryptField(value.webhookSecret.trim()) : null,
    encryptionKeyEncrypted: value.encryptionKey?.trim() ? encryptField(value.encryptionKey.trim()) : null,
    config,
    // Imported keys were never tested: the tenant (or the next "Test connection") verifies them.
    status: !enabled ? 'DISABLED' : provider === 'BANK_TRANSFER' || provider === 'COD' ? 'VERIFIED' : 'UNVERIFIED'
  };
}

/**
 * Backfill for migration 0055_tenant_payment_gateways (WP-2.12):
 * - each tenant's `TenantSettings.paymentGatewayKey` (plaintext JSON) becomes one encrypted TenantPaymentGateway row per
 *   configured provider; providers that already have a row are left alone (idempotent);
 * - `TenantSettings.webhookSecret` is encrypted in place (`v1:` prefix) where it is still plaintext;
 * - with `clearLegacy`, `paymentGatewayKey` is set to null once its rows exist (the column is dropped in 0079).
 * `dryRun` only counts.
 */
type GatewayBackfillDb = Pick<PrismaClient, '$queryRaw' | '$executeRaw' | 'tenantSettings' | 'tenantPaymentGateway'>;

export async function backfillTenantPaymentGateways(prisma: GatewayBackfillDb, options: { dryRun: boolean; clearLegacy?: boolean }): Promise<PaymentGatewaysBackfillResult> {
  const result: PaymentGatewaysBackfillResult = { dryRun: options.dryRun, tenantsWithLegacyKeys: 0, gatewaysCreated: 0, skippedExisting: 0, unparseable: 0, webhookSecretsEncrypted: 0, legacyKeysCleared: 0 };
  // `paymentGatewayKey` is dropped from the Prisma schema in 0079 (D10), so the legacy column is read with SQL; this
  // backfill must run before 0079.
  const settings = await prisma.$queryRaw<Array<{ tenantId: string; paymentGatewayKey: string | null; webhookSecret: string | null }>>`
    SELECT "tenantId", "paymentGatewayKey", "webhookSecret" FROM "tenant_settings" WHERE "paymentGatewayKey" IS NOT NULL OR "webhookSecret" IS NOT NULL`;
  for (const row of settings) {
    if (row.paymentGatewayKey) {
      result.tenantsWithLegacyKeys += 1;
      const legacy = parseLegacyGatewayKey(row.paymentGatewayKey);
      if (!legacy) {
        result.unparseable += 1;
      } else {
        const existing = new Set((await prisma.tenantPaymentGateway.findMany({ where: { tenantId: row.tenantId }, select: { provider: true } })).map((item) => item.provider));
        for (const provider of GATEWAY_PROVIDERS) {
          const value = legacy[provider];
          if (!value || !hasContent(provider, value)) continue;
          if (existing.has(provider)) {
            result.skippedExisting += 1;
            continue;
          }
          result.gatewaysCreated += 1;
          if (!options.dryRun) await prisma.tenantPaymentGateway.create({ data: rowFor(row.tenantId, provider, value) });
        }
        if (options.clearLegacy) {
          result.legacyKeysCleared += 1;
          if (!options.dryRun) await prisma.$executeRaw`UPDATE "tenant_settings" SET "paymentGatewayKey" = NULL WHERE "tenantId" = ${row.tenantId}`;
        }
      }
    }
    if (row.webhookSecret && !isEncryptedField(row.webhookSecret)) {
      result.webhookSecretsEncrypted += 1;
      if (!options.dryRun) await prisma.tenantSettings.update({ where: { tenantId: row.tenantId }, data: { webhookSecret: encryptField(row.webhookSecret) } });
    }
  }
  return result;
}
