import type { FastifyInstance } from 'fastify';
import type { Prisma, TenantPaymentGateway } from '@prisma/client';
import { z } from 'zod';
import { decryptField, encryptField } from './crypto/field-encryption.js';
import { recordAndPublishActivity, type ActivityInput } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';

// L11 (WP-2.12): a tenant's own payment gateways (collecting from its customers; separate from Fauward billing).
// Secrets are field-encrypted at rest and never returned by any route — the tenant sees "set / not set", the console
// sees provider, mode, status and the last error (S12, ACC-L11-2). "Test connection" asks the provider.

export const GATEWAY_PROVIDERS = ['STRIPE', 'PAYSTACK', 'FLUTTERWAVE', 'BANK_TRANSFER', 'COD'] as const;
export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];
export const TESTABLE_PROVIDERS: readonly GatewayProvider[] = ['STRIPE', 'PAYSTACK', 'FLUTTERWAVE'];
/** Offline methods need no verification: enabling them is enough. */
const OFFLINE_PROVIDERS: readonly GatewayProvider[] = ['BANK_TRANSFER', 'COD'];

const text = (max: number) => z.string().trim().max(max);
/** Secrets: omitted = keep the stored value; empty string = remove it. */
const secret = z.string().trim().max(500).optional();

const configSchemas: Record<GatewayProvider, z.ZodType<Record<string, unknown>>> = {
  STRIPE: z.object({ accountId: text(100).optional() }).strict(),
  PAYSTACK: z.object({ merchantEmail: z.union([z.string().trim().email(), z.literal('')]).optional() }).strict(),
  FLUTTERWAVE: z.object({}).strict(),
  BANK_TRANSFER: z
    .object({ bankName: text(120).optional(), accountName: text(120).optional(), accountNumber: text(40).optional(), sortCode: text(20).optional(), iban: text(50).optional(), instructions: text(2000).optional() })
    .strict(),
  COD: z.object({ remittanceWindowDays: z.number().int().min(0).max(30).optional(), instructions: text(2000).optional() }).strict()
};

export const gatewayBody = z.object({
  enabled: z.boolean(),
  publicKey: text(300).optional(),
  secretKey: secret,
  webhookSecret: secret,
  encryptionKey: secret,
  config: z.record(z.unknown()).default({})
});
export type GatewayInput = z.infer<typeof gatewayBody>;

export class GatewayError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function parseProvider(value: string): GatewayProvider {
  const upper = value.toUpperCase();
  if (!(GATEWAY_PROVIDERS as readonly string[]).includes(upper)) throw new GatewayError(404, 'UNKNOWN_PROVIDER', `Unknown payment provider ${value}`);
  return upper as GatewayProvider;
}

/** TEST or LIVE from the provider's key prefix; offline methods are LIVE. */
export function modeForKey(provider: GatewayProvider, secretKey: string | null): 'TEST' | 'LIVE' {
  if (!secretKey) return 'LIVE';
  if (provider === 'FLUTTERWAVE') return /^FLWSECK_TEST/i.test(secretKey) ? 'TEST' : 'LIVE';
  return /^(sk|rk)_test_/.test(secretKey) ? 'TEST' : 'LIVE';
}

function configOf(row: Pick<TenantPaymentGateway, 'config'> | null): Record<string, unknown> {
  const value = row?.config;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Tenant view: everything except the secrets, which are reported as set / not set. */
export function presentTenantGateway(provider: GatewayProvider, row: TenantPaymentGateway | null) {
  return {
    provider,
    configured: row !== null,
    enabled: row?.enabled ?? false,
    mode: row?.mode ?? null,
    publicKey: row?.publicKey ?? null,
    config: configOf(row),
    secretKeySet: Boolean(row?.secretKeyEncrypted),
    webhookSecretSet: Boolean(row?.webhookSecretEncrypted),
    encryptionKeySet: Boolean(row?.encryptionKeyEncrypted),
    testable: TESTABLE_PROVIDERS.includes(provider),
    status: row?.status ?? 'UNVERIFIED',
    lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null
  };
}

/** Console view (C360 Config, Integration Health): never keys, never bank details — only state (ACC-L11-2). */
export function presentConsoleGateway(row: TenantPaymentGateway) {
  return {
    provider: row.provider,
    mode: row.mode,
    enabled: row.enabled,
    status: row.status,
    secretConfigured: Boolean(row.secretKeyEncrypted),
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    lastError: row.lastError,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function listTenantGateways(app: FastifyInstance, tenantId: string) {
  const [rows, settings] = await Promise.all([
    app.prisma.tenantPaymentGateway.findMany({ where: { tenantId } }),
    app.prisma.tenantSettings.findUnique({ where: { tenantId }, select: { paymentGateway: true } })
  ]);
  return {
    activeProvider: settings?.paymentGateway ?? null,
    gateways: GATEWAY_PROVIDERS.map((provider) => presentTenantGateway(provider, rows.find((row) => row.provider === provider) ?? null))
  };
}

type Actor = { userId: string; label: string };

function activityDeps(app: FastifyInstance) {
  return { prisma: app.prisma, redis: app.redis, log: app.log };
}

function gatewayActivity(tenantId: string, provider: GatewayProvider, rowId: string): Pick<ActivityInput, 'service' | 'tenantId' | 'subjectType' | 'subjectId' | 'consoleLink'> {
  return { service: 'platform.integrations', tenantId, subjectType: 'tenant_payment_gateway', subjectId: rowId, consoleLink: `/customer/360/${tenantId}?tab=config` };
}

/** Save one provider. A changed key resets the status to UNVERIFIED until the next test. */
export async function saveTenantGateway(app: FastifyInstance, tenantId: string, provider: GatewayProvider, input: GatewayInput, actor: Actor) {
  const parsedConfig = configSchemas[provider].safeParse(input.config);
  if (!parsedConfig.success) throw new GatewayError(400, 'VALIDATION', parsedConfig.error.issues[0]?.message ?? 'Invalid settings');
  if (OFFLINE_PROVIDERS.includes(provider) && (input.secretKey || input.webhookSecret || input.encryptionKey || input.publicKey)) {
    throw new GatewayError(400, 'VALIDATION', `${provider} takes no API keys`);
  }
  const existing = await app.prisma.tenantPaymentGateway.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  const nextSecret = (key: string | undefined, current: string | null | undefined) => (key === undefined ? current ?? null : key === '' ? null : encryptField(key));
  const secretKeyEncrypted = nextSecret(input.secretKey, existing?.secretKeyEncrypted);
  const webhookSecretEncrypted = nextSecret(input.webhookSecret, existing?.webhookSecretEncrypted);
  const encryptionKeyEncrypted = nextSecret(input.encryptionKey, existing?.encryptionKeyEncrypted);
  const publicKey = input.publicKey === undefined ? existing?.publicKey ?? null : input.publicKey || null;
  const keysChanged = input.secretKey !== undefined || input.publicKey !== undefined || input.encryptionKey !== undefined;
  const mode = input.secretKey !== undefined ? modeForKey(provider, input.secretKey || null) : existing?.mode ?? 'LIVE';
  const status = !input.enabled ? 'DISABLED' : OFFLINE_PROVIDERS.includes(provider) ? 'VERIFIED' : keysChanged || !existing || existing.status === 'DISABLED' ? 'UNVERIFIED' : existing.status;
  const data = {
    enabled: input.enabled,
    mode,
    publicKey,
    secretKeyEncrypted,
    webhookSecretEncrypted,
    encryptionKeyEncrypted,
    config: parsedConfig.data as Prisma.InputJsonObject,
    status,
    ...(status === 'UNVERIFIED' || status === 'DISABLED' ? { lastError: null } : {}),
    ...(OFFLINE_PROVIDERS.includes(provider) && input.enabled ? { lastVerifiedAt: new Date(), lastError: null } : {}),
    updatedByUserId: actor.userId
  };
  const row = await app.prisma.tenantPaymentGateway.upsert({ where: { tenantId_provider: { tenantId, provider } }, update: data, create: { tenantId, provider, ...data } });
  await recordAndPublishActivity(activityDeps(app), {
    ...gatewayActivity(tenantId, provider, row.id),
    type: 'gateway.configured',
    actorType: 'TENANT_USER',
    actorId: actor.userId,
    actorLabel: actor.label,
    summary: `${provider} gateway ${input.enabled ? `saved (${mode.toLowerCase()})` : 'disabled'}`
  });
  return row;
}

export async function setActiveProvider(app: FastifyInstance, tenantId: string, provider: GatewayProvider) {
  const row = await app.prisma.tenantPaymentGateway.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  if (!row?.enabled) throw new GatewayError(409, 'PROVIDER_NOT_ENABLED', 'Enable and save this provider before making it the default.');
  await app.prisma.tenantSettings.upsert({ where: { tenantId }, update: { paymentGateway: provider }, create: { tenantId, paymentGateway: provider } });
}

type ProviderCheck = { ok: true } | { ok: false; error: string };
export type GatewayFetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const CHECK_URLS: Record<string, string> = {
  STRIPE: 'https://api.stripe.com/v1/balance',
  PAYSTACK: 'https://api.paystack.co/balance',
  FLUTTERWAVE: 'https://api.flutterwave.com/v3/balances'
};

/** Read-only balance call with the tenant's secret key: proves the key works, moves no money. */
async function checkWithProvider(provider: GatewayProvider, secretKey: string, fetcher: GatewayFetch): Promise<ProviderCheck> {
  try {
    const response = await fetcher(CHECK_URLS[provider], { headers: { Authorization: `Bearer ${secretKey}` }, signal: AbortSignal.timeout(10_000) });
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } | string; message?: string } | null;
    const message = typeof body?.error === 'object' ? body.error?.message : typeof body?.error === 'string' ? body.error : body?.message;
    return { ok: false, error: `${provider} returned ${response.status}${message ? `: ${message}` : ''}`.slice(0, 500) };
  } catch (error) {
    return { ok: false, error: `${provider} could not be reached: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500) };
  }
}

/** POST …/test: VERIFIED or FAILED with the provider's error; a failure tells the tenant's admins. */
export async function testTenantGateway(app: FastifyInstance, tenantId: string, provider: GatewayProvider, actor: Actor, fetcher: GatewayFetch = fetch) {
  if (!TESTABLE_PROVIDERS.includes(provider)) throw new GatewayError(400, 'NOT_TESTABLE', `${provider} has no API to test`);
  const row = await app.prisma.tenantPaymentGateway.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  if (!row?.secretKeyEncrypted) throw new GatewayError(409, 'NO_SECRET_KEY', 'Save a secret key before testing the connection.');
  const result = await checkWithProvider(provider, decryptField(row.secretKeyEncrypted), fetcher);
  const now = new Date();
  const updated = await app.prisma.tenantPaymentGateway.update({
    where: { id: row.id },
    data: result.ok ? { status: 'VERIFIED', lastVerifiedAt: now, lastError: null } : { status: 'FAILED', lastError: result.error }
  });
  await recordAndPublishActivity(activityDeps(app), {
    ...gatewayActivity(tenantId, provider, row.id),
    type: result.ok ? 'gateway.verified' : 'gateway.failed',
    actorType: 'TENANT_USER',
    actorId: actor.userId,
    actorLabel: actor.label,
    summary: result.ok ? `${provider} gateway verified (${row.mode.toLowerCase()})` : `${provider} gateway verification failed: ${result.error}`,
    severity: result.ok ? 'INFO' : 'ATTENTION'
  });
  if (!result.ok) {
    await notifyTenantAdmins(app, {
      tenantId,
      event: 'gateway.failed',
      title: `${provider} connection test failed`,
      body: result.error,
      link: '/settings?tab=integrations',
      email: { template: 'gateway_verification_failed', data: { provider, error: result.error } }
    });
  }
  return updated;
}

/** Onboarding/usage: a tenant can collect payments once a gateway is verified or an offline method is enabled. */
export async function hasVerifiedGateway(db: Pick<Prisma.TransactionClient, 'tenantPaymentGateway'>, tenantId: string) {
  const count = await db.tenantPaymentGateway.count({ where: { tenantId, enabled: true, status: 'VERIFIED' } });
  return count > 0;
}
