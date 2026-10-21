import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IntegrationProviderStatus, NotificationChannel, Prisma } from '@prisma/client';
import { auditedMutation, staffMutationActor, type MutationActor } from './console-mutation.js';
import { listSecrets } from './secret-inventory.service.js';
import { readVendorEnv, requireVendorEnv, vendorRequest } from './vendors/http.js';
import { VendorError } from './vendors/vendor-error.js';
import { stripeAdapter } from './vendors/stripe.adapter.js';
import { dopplerAdapter } from './vendors/doppler.adapter.js';

// platform.integrations (WP-4.3). Each known provider is NOT_CONFIGURED (its env vars are missing — computed, never
// polled), or polled every 5 minutes by `platform.integration-health-poll` with one cheap authenticated call: OK, DEGRADED
// (the call works but ≥ 20% of the last 24 h's sends through it failed) or DOWN (the call fails). Each poll is appended
// to a short history on the IntegrationProviderStatus row; a status change writes an activity.

export const INTEGRATION_STATUSES = ['NOT_CONFIGURED', 'OK', 'DEGRADED', 'DOWN'] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
export const DEGRADED_ERROR_RATE = 0.2;
const HISTORY_LIMIT = 50;
const SERVICE = 'platform.integrations';
const POLLER: MutationActor = { kind: 'system', id: 'platform.integration-health-poll', label: 'Integration health poll' };

type Provider = {
  key: string;
  name: string;
  /** What the poll calls, shown on the detail page. */
  check: string;
  envNames: string[];
  missing: (env?: NodeJS.ProcessEnv) => string[];
  ping: () => Promise<void>;
  /** Notification channel whose NotificationLog failures give the 24 h error rate. */
  channel?: NotificationChannel;
  notificationProvider?: string;
};

const spec = (required: string[], optional: Record<string, string> = {}) => ({ required, optional });

/** Authenticated GET for the notification providers (not vendor adapters): the answer body is never kept. */
async function probe(name: string, url: string, headers: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new IntegrationError(502, 'UNREACHABLE', `${name} unreachable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new IntegrationError(502, 'UPSTREAM_ERROR', `${name} answered ${response.status}`);
}

function envValues(required: string[], optional: Record<string, string>) {
  return readVendorEnv(spec(required, optional)).values as Record<string, string>;
}
const missingOf = (required: string[], optional: Record<string, string> = {}) => (env: NodeJS.ProcessEnv = process.env) => readVendorEnv(spec(required, optional), env).missing;

const PROVIDERS: Provider[] = [
  {
    key: 'stripe',
    name: 'Stripe',
    check: 'balance.retrieve',
    envNames: ['STRIPE_SECRET_KEY'],
    missing: () => stripeAdapter.missingEnv(),
    ping: async () => {
      await stripeAdapter.ping();
    }
  },
  {
    key: 'sendgrid',
    name: 'SendGrid',
    check: 'GET /v3/scopes',
    envNames: ['SENDGRID_API_KEY'],
    missing: missingOf(['SENDGRID_API_KEY']),
    channel: 'EMAIL',
    notificationProvider: 'SENDGRID',
    ping: async () => {
      const values = envValues(['SENDGRID_API_KEY'], { SENDGRID_BASE_URL: 'https://api.sendgrid.com' });
      await probe('SendGrid', `${values.SENDGRID_BASE_URL}/v3/scopes`, { Authorization: `Bearer ${values.SENDGRID_API_KEY}` });
    }
  },
  {
    key: 'twilio',
    name: 'Twilio',
    check: 'GET /Accounts/{sid}',
    envNames: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    missing: missingOf(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']),
    channel: 'SMS',
    notificationProvider: 'TWILIO',
    ping: async () => {
      const values = envValues(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], { TWILIO_BASE_URL: 'https://api.twilio.com' });
      const auth = Buffer.from(`${values.TWILIO_ACCOUNT_SID}:${values.TWILIO_AUTH_TOKEN}`).toString('base64');
      await probe('Twilio', `${values.TWILIO_BASE_URL}/2010-04-01/Accounts/${encodeURIComponent(values.TWILIO_ACCOUNT_SID)}.json`, { Authorization: `Basic ${auth}` });
    }
  },
  {
    key: 'pagerduty',
    name: 'PagerDuty',
    check: 'GET /abilities',
    envNames: ['PAGERDUTY_API_TOKEN'],
    missing: missingOf(['PAGERDUTY_API_TOKEN']),
    ping: async () => {
      const values = requireVendorEnv('pagerduty', spec(['PAGERDUTY_API_TOKEN'], { PAGERDUTY_BASE_URL: 'https://api.pagerduty.com' }));
      await vendorRequest('pagerduty', `${values.PAGERDUTY_BASE_URL}/abilities`, { headers: { Authorization: `Token token=${values.PAGERDUTY_API_TOKEN}` } });
    }
  },
  {
    key: 'launchdarkly',
    name: 'LaunchDarkly',
    check: 'GET /projects/{project}',
    envNames: ['LAUNCHDARKLY_API_TOKEN'],
    missing: missingOf(['LAUNCHDARKLY_API_TOKEN']),
    ping: async () => {
      const values = requireVendorEnv('launchdarkly', spec(['LAUNCHDARKLY_API_TOKEN'], { LAUNCHDARKLY_BASE_URL: 'https://app.launchdarkly.com/api/v2', LAUNCHDARKLY_PROJECT_KEY: 'default' }));
      await vendorRequest('launchdarkly', `${values.LAUNCHDARKLY_BASE_URL}/projects/${encodeURIComponent(values.LAUNCHDARKLY_PROJECT_KEY)}`, { headers: { Authorization: values.LAUNCHDARKLY_API_TOKEN } });
    }
  },
  {
    key: 'github',
    name: 'GitHub',
    check: 'GET /repos/{repository}',
    envNames: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'],
    missing: missingOf(['GITHUB_TOKEN', 'GITHUB_REPOSITORY']),
    ping: async () => {
      const values = requireVendorEnv('github', spec(['GITHUB_TOKEN', 'GITHUB_REPOSITORY'], { GITHUB_API_BASE_URL: 'https://api.github.com' }));
      await vendorRequest('github', `${values.GITHUB_API_BASE_URL}/repos/${values.GITHUB_REPOSITORY}`, { headers: { Authorization: `Bearer ${values.GITHUB_TOKEN}` } });
    }
  },
  {
    key: 'doppler',
    name: 'Doppler',
    check: 'GET /configs/config/secrets/names',
    envNames: dopplerAdapter.envNames,
    missing: () => dopplerAdapter.missingEnv(),
    ping: async () => {
      await dopplerAdapter.listSecretNames();
    }
  },
  {
    key: 'persona',
    name: 'Persona',
    check: 'GET /inquiries?page[size]=1',
    envNames: ['PERSONA_API_KEY'],
    missing: missingOf(['PERSONA_API_KEY']),
    ping: async () => {
      const values = requireVendorEnv('persona', spec(['PERSONA_API_KEY'], { PERSONA_BASE_URL: 'https://withpersona.com/api/v1' }));
      await vendorRequest('persona', `${values.PERSONA_BASE_URL}/inquiries`, { headers: { Authorization: `Bearer ${values.PERSONA_API_KEY}` }, query: { 'page[size]': 1 } });
    }
  },
  {
    key: 'complyadvantage',
    name: 'ComplyAdvantage',
    check: 'GET /searches?per_page=1',
    envNames: ['COMPLYADVANTAGE_API_KEY'],
    missing: missingOf(['COMPLYADVANTAGE_API_KEY']),
    ping: async () => {
      const values = requireVendorEnv('complyadvantage', spec(['COMPLYADVANTAGE_API_KEY'], { COMPLYADVANTAGE_BASE_URL: 'https://api.complyadvantage.com' }));
      await vendorRequest('complyadvantage', `${values.COMPLYADVANTAGE_BASE_URL}/searches`, { headers: { Authorization: `Token ${values.COMPLYADVANTAGE_API_KEY}` }, query: { per_page: 1 } });
    }
  },
  {
    key: 'docusign',
    name: 'DocuSign',
    check: 'GET /accounts/{id}',
    envNames: ['DOCUSIGN_ACCESS_TOKEN', 'DOCUSIGN_ACCOUNT_ID'],
    missing: missingOf(['DOCUSIGN_ACCESS_TOKEN', 'DOCUSIGN_ACCOUNT_ID']),
    ping: async () => {
      const values = requireVendorEnv('docusign', spec(['DOCUSIGN_ACCESS_TOKEN', 'DOCUSIGN_ACCOUNT_ID'], { DOCUSIGN_BASE_URL: 'https://demo.docusign.net/restapi' }));
      await vendorRequest('docusign', `${values.DOCUSIGN_BASE_URL}/v2.1/accounts/${encodeURIComponent(values.DOCUSIGN_ACCOUNT_ID)}`, { headers: { Authorization: `Bearer ${values.DOCUSIGN_ACCESS_TOKEN}` } });
    }
  },
  {
    key: 'hubspot',
    name: 'HubSpot',
    check: 'GET /crm/v3/objects/deals?limit=1',
    envNames: ['HUBSPOT_ACCESS_TOKEN'],
    missing: missingOf(['HUBSPOT_ACCESS_TOKEN']),
    ping: async () => {
      const values = requireVendorEnv('hubspot', spec(['HUBSPOT_ACCESS_TOKEN'], { HUBSPOT_BASE_URL: 'https://api.hubapi.com' }));
      await vendorRequest('hubspot', `${values.HUBSPOT_BASE_URL}/crm/v3/objects/deals`, { headers: { Authorization: `Bearer ${values.HUBSPOT_ACCESS_TOKEN}` }, query: { limit: 1 } });
    }
  }
];

export function knownProviders() {
  return PROVIDERS.map(({ key, name, check, envNames }) => ({ key, name, check, envNames }));
}

export function findProvider(key: string) {
  return PROVIDERS.find((provider) => provider.key === key) ?? null;
}

export class IntegrationError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type HistoryEntry = { at: string; status: IntegrationStatus; latencyMs: number; error: string | null; errorRate24h: number | null };
type StoredPayload = { history?: HistoryEntry[]; lastError?: { at: string; message: string } | null; lastWebhookVerification?: unknown };

function payloadOf(row: Pick<IntegrationProviderStatus, 'payload'> | null): StoredPayload {
  const value = row?.payload;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as StoredPayload) : {};
}

/** Failed share of the last 24 h's sends through the provider (NotificationLog), or null when it has no such source. */
async function errorRate24h(app: Pick<FastifyInstance, 'prisma'>, provider: Provider, now: Date) {
  if (!provider.channel || !provider.notificationProvider) return null;
  const since = new Date(now.getTime() - 86_400_000);
  const where: Prisma.NotificationLogWhereInput = { channel: provider.channel, provider: provider.notificationProvider, createdAt: { gte: since }, status: { in: ['SENT', 'FAILED'] } };
  const [total, failed] = await Promise.all([app.prisma.notificationLog.count({ where }), app.prisma.notificationLog.count({ where: { ...where, status: 'FAILED' } })]);
  return total === 0 ? null : failed / total;
}

function errorMessage(error: unknown) {
  if (error instanceof VendorError) return error.message;
  if (error instanceof Error) return error.message.slice(0, 300);
  return 'Check failed';
}

/** One check for one configured provider; writes the row (+ history) and, on a status change, an audited activity. */
export async function checkProvider(app: Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>, provider: Provider, actor: MutationActor = POLLER, now = new Date()) {
  const started = Date.now();
  let error: string | null = null;
  try {
    await provider.ping();
  } catch (err) {
    error = errorMessage(err);
  }
  const latencyMs = Date.now() - started;
  const rate = await errorRate24h(app, provider, now);
  const status: IntegrationStatus = error ? 'DOWN' : rate !== null && rate >= DEGRADED_ERROR_RATE ? 'DEGRADED' : 'OK';

  const before = await app.prisma.integrationProviderStatus.findUnique({ where: { provider: provider.key } });
  const previous = payloadOf(before);
  const entry: HistoryEntry = { at: now.toISOString(), status, latencyMs, error, errorRate24h: rate };
  const payload = {
    ...previous,
    history: [entry, ...(previous.history ?? [])].slice(0, HISTORY_LIMIT),
    lastError: error ? { at: now.toISOString(), message: error } : previous.lastError ?? null
  } as Prisma.InputJsonObject;
  const data = { status, checkedAt: now, errorRate24h: rate ?? 0, payload, ...(status === 'DOWN' ? {} : { lastSuccessfulAt: now }) };

  const changed = before?.status !== status;
  const staffCheck = actor.kind === 'staff';
  if (!changed && !staffCheck) {
    return app.prisma.integrationProviderStatus.upsert({ where: { provider: provider.key }, create: { provider: provider.key, ...data }, update: data });
  }
  return auditedMutation(app, SERVICE, actor, async (tx) => {
    const row = await tx.integrationProviderStatus.upsert({ where: { provider: provider.key }, create: { provider: provider.key, ...data }, update: data });
    return {
      result: row,
      audit: { action: staffCheck ? 'INTEGRATION_CHECKED' : 'INTEGRATION_STATUS_CHANGED', metadata: { provider: provider.key, from: before?.status ?? null, to: status, latencyMs, error } },
      activity: {
        type: changed ? 'integration.status_changed' : 'integration.checked',
        subjectType: 'integration',
        subjectId: provider.key,
        summary: changed ? `${provider.name} is ${status.toLowerCase()}${error ? `: ${error}` : ''}` : `${provider.name} checked: ${status.toLowerCase()}`,
        severity: status === 'DOWN' ? 'CRITICAL' : status === 'DEGRADED' ? 'ATTENTION' : 'INFO',
        consoleLink: `/platform/integrations/${provider.key}`
      }
    };
  });
}

/** The poll job: checks configured providers only (ACC-INT-1); unconfigured ones are reported as NOT_CONFIGURED. */
export async function pollIntegrations(app: Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>, now = new Date()) {
  const configured = PROVIDERS.filter((provider) => provider.missing().length === 0);
  const results: Record<string, IntegrationStatus> = {};
  for (const provider of configured) {
    const row = await checkProvider(app, provider, POLLER, now);
    results[provider.key] = row.status as IntegrationStatus;
  }
  return { configured: configured.length, notConfigured: PROVIDERS.length - configured.length, results };
}

export async function checkProviderNow(app: FastifyInstance, request: FastifyRequest, key: string) {
  const provider = findProvider(key);
  if (!provider) throw new IntegrationError(404, 'UNKNOWN_PROVIDER', `Unknown provider ${key}`);
  const missing = provider.missing();
  if (missing.length) throw new IntegrationError(409, 'NOT_CONFIGURED', `${provider.name} is not configured (${missing.join(', ')})`);
  await checkProvider(app, provider, staffMutationActor(request));
  return getProviderDetail(app, key);
}

function summary(provider: Provider, row: IntegrationProviderStatus | null) {
  const missing = provider.missing();
  const configured = missing.length === 0;
  const stored = payloadOf(row);
  return {
    provider: provider.key,
    name: provider.name,
    check: provider.check,
    configured,
    missingEnv: missing,
    status: (configured ? row?.status ?? 'OK' : 'NOT_CONFIGURED') as IntegrationStatus | string,
    polled: configured && Boolean(row),
    lastSuccessfulAt: configured ? row?.lastSuccessfulAt?.toISOString() ?? null : null,
    checkedAt: configured && row ? row.checkedAt.toISOString() : null,
    errorRate24h: configured && row && provider.channel ? Number(row.errorRate24h) : null,
    errorRateSource: provider.channel ? `NotificationLog (${provider.channel})` : null,
    lastError: configured ? stored.lastError ?? null : null
  };
}

export async function listIntegrations(app: Pick<FastifyInstance, 'prisma'>) {
  const rows = await app.prisma.integrationProviderStatus.findMany({ where: { provider: { in: PROVIDERS.map((provider) => provider.key) } } });
  const byKey = new Map(rows.map((row) => [row.provider, row]));
  const data = PROVIDERS.map((provider) => summary(provider, byKey.get(provider.key) ?? null));
  return { data, pollEveryMinutes: 5 };
}

export async function getProviderDetail(app: Pick<FastifyInstance, 'prisma'>, key: string) {
  const provider = findProvider(key);
  if (!provider) return null;
  const row = await app.prisma.integrationProviderStatus.findUnique({ where: { provider: key } });
  const stored = payloadOf(row);
  const history = stored.history ?? [];
  return {
    ...summary(provider, row),
    envNames: provider.envNames,
    history,
    recentErrors: history.filter((entry) => entry.error).slice(0, 10),
    lastWebhookVerification: stored.lastWebhookVerification ?? null
  };
}

/** Credentials view: the secret inventory rows tied to an integration (fingerprints and dates, never values). */
export async function integrationCredentials(app: Pick<FastifyInstance, 'prisma'>) {
  const all = await listSecrets(app);
  const data = all.data.filter((row) => row.integration);
  return { data, total: data.length, lastInventoryRun: all.lastInventoryRun };
}
