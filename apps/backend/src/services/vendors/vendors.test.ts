import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WP-4.0a (D9, S16): vendor adapters. Unset env → isConfigured() false (services take their native path); a vendor
// failure → VendorError → 502 { error: 'VENDOR_ERROR', vendor, degraded: true } without the upstream body.

const stripeMocks = vi.hoisted(() => ({ payInvoice: vi.fn(), retrieveBalance: vi.fn() }));
vi.mock('../../modules/payments/stripe.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../modules/payments/stripe.service.js')>();
  return { ...actual, stripeService: { ...actual.stripeService, payInvoice: stripeMocks.payInvoice, retrieveBalance: stripeMocks.retrieveBalance } };
});
const configMock = vi.hoisted(() => ({ stripe: { secretKey: undefined as string | undefined, webhookSecret: undefined as string | undefined } }));
vi.mock('../../config/index.js', () => ({ config: configMock }));

const { VENDOR_ADAPTERS, vendorStatus } = await import('./index.js');
const { VendorError, vendorErrorHandler } = await import('./vendor-error.js');
const { launchDarklyAdapter } = await import('./launchdarkly.adapter.js');
const { docusignAdapter } = await import('./docusign.adapter.js');
const { githubAdapter } = await import('./github.adapter.js');
const { stripeAdapter } = await import('./stripe.adapter.js');

const VENDOR_ENV = [
  'LAUNCHDARKLY_API_TOKEN',
  'LAUNCHDARKLY_PROJECT_KEY',
  'LAUNCHDARKLY_ENVIRONMENT_KEY',
  'GITHUB_TOKEN',
  'GITHUB_REPOSITORY',
  'PAGERDUTY_WEBHOOK_SECRET',
  'PAGERDUTY_API_TOKEN',
  'STRIPE_TAX_ENABLED',
  'ANROK_API_KEY',
  'PERSONA_API_KEY',
  'PERSONA_INQUIRY_TEMPLATE_ID',
  'COMPLYADVANTAGE_API_KEY',
  'DOPPLER_API_TOKEN',
  'DOPPLER_PROJECT',
  'DOPPLER_CONFIG',
  'HUBSPOT_ACCESS_TOKEN',
  'DOCUSIGN_ACCESS_TOKEN',
  'DOCUSIGN_ACCOUNT_ID'
];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of VENDOR_ENV) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  configMock.stripe.secretKey = undefined;
  stripeMocks.payInvoice.mockReset();
  stripeMocks.retrieveBalance.mockReset();
});

afterEach(() => {
  for (const name of VENDOR_ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.unstubAllGlobals();
});

function fetchAnswering(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL | string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    })
  );
  return calls;
}

describe('vendor adapters (WP-4.0a)', () => {
  it('every adapter reports isConfigured() false and names its missing env vars when vendor env is unset', () => {
    const names = Object.keys(VENDOR_ADAPTERS) as Array<keyof typeof VENDOR_ADAPTERS>;
    expect(names.sort()).toEqual(['anrok', 'complyadvantage', 'docusign', 'doppler', 'github', 'hubspot', 'launchdarkly', 'pagerduty', 'persona', 'stripe', 'stripe-tax']);
    for (const name of names) {
      expect(VENDOR_ADAPTERS[name].isConfigured(), name).toBe(false);
      const status = vendorStatus(name);
      expect(status?.configured, name).toBe(false);
      expect(status?.missing.length, name).toBeGreaterThan(0);
    }
  });

  it('an unconfigured adapter throws VendorNotConfiguredError instead of calling the network', async () => {
    const calls = fetchAnswering(200, {});
    await expect(githubAdapter.listReleases()).rejects.toMatchObject({ name: 'VendorNotConfiguredError', vendor: 'github', missing: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'] });
    expect(calls).toHaveLength(0);
  });

  it('a vendor 5xx becomes VendorError and a console route answers 502 VENDOR_ERROR without the upstream body', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_REPOSITORY = 'fauward/fauward';
    fetchAnswering(500, { message: 'secret upstream detail' });
    const app = Fastify();
    app.setErrorHandler(vendorErrorHandler);
    app.get('/releases', async () => githubAdapter.listReleases());
    app.get('/boom', async () => {
      throw Object.assign(new Error('plain'), { statusCode: 400 });
    });
    const response = await app.inject({ method: 'GET', url: '/releases' });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: 'VENDOR_ERROR', vendor: 'github', degraded: true });
    expect(response.body).not.toContain('secret upstream detail');
    // Non-vendor errors keep Fastify's default handling.
    const other = await app.inject({ method: 'GET', url: '/boom' });
    expect(other.statusCode).toBe(400);
    await app.close();
  });

  it('a network failure becomes VendorError', async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = 'pat-test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );
    await expect(VENDOR_ADAPTERS.hubspot.listDeals()).rejects.toBeInstanceOf(VendorError);
  });

  it('LaunchDarkly targets one tenant on context kind tenant with a semantic patch and never sends turnFlagOn', async () => {
    process.env.LAUNCHDARKLY_API_TOKEN = 'api-test';
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string, init: RequestInit) => {
        calls.push({ url: String(url), init });
        const body = init.method === 'PATCH' ? {} : { key: 'fleet', variations: [{ _id: 'var-on', value: true }, { _id: 'var-off', value: false }] };
        return new Response(JSON.stringify(body), { status: 200 });
      })
    );
    const instructions = await launchDarklyAdapter.setTenantTarget('fleet', 'tenant-a', true, 'override');
    expect(instructions).toEqual([
      { kind: 'removeTargets', contextKind: 'tenant', variationId: 'var-off', values: ['tenant-a'] },
      { kind: 'addTargets', contextKind: 'tenant', variationId: 'var-on', values: ['tenant-a'] }
    ]);
    const patch = calls.find((call) => call.init.method === 'PATCH')!;
    expect((patch.init.headers as Record<string, string>)['Content-Type']).toContain('semanticpatch');
    expect(String(patch.init.body)).not.toContain('turnFlagOn');
    expect(JSON.parse(String(patch.init.body))).toMatchObject({ environmentKey: 'production' });
  });

  it('DocuSign refuses an envelope without a document or signers', async () => {
    process.env.DOCUSIGN_ACCESS_TOKEN = 'token';
    process.env.DOCUSIGN_ACCOUNT_ID = 'acct';
    const calls = fetchAnswering(201, { envelopeId: 'env-1' });
    await expect(docusignAdapter.createEnvelope({ emailSubject: 'Quote', document: { name: 'q.pdf', fileExtension: 'pdf', base64: '' }, signers: [{ name: 'A', email: 'a@x.test' }] })).rejects.toBeInstanceOf(VendorError);
    await expect(docusignAdapter.createEnvelope({ emailSubject: 'Quote', document: { name: 'q.pdf', fileExtension: 'pdf', base64: 'JVBERi0=' }, signers: [] })).rejects.toBeInstanceOf(VendorError);
    expect(calls).toHaveLength(0);
    const envelope = await docusignAdapter.createEnvelope({ emailSubject: 'Quote', document: { name: 'q.pdf', fileExtension: 'pdf', base64: 'JVBERi0=' }, signers: [{ name: 'A', email: 'a@x.test' }] });
    expect(envelope.envelopeId).toBe('env-1');
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.documents).toHaveLength(1);
    expect(sent.recipients.signers).toHaveLength(1);
  });

  it('Stripe SDK failures become VendorError(stripe); the adapter is configured only with a secret key', async () => {
    expect(stripeAdapter.isConfigured()).toBe(false);
    configMock.stripe.secretKey = 'sk_test_x';
    expect(stripeAdapter.isConfigured()).toBe(true);
    stripeMocks.payInvoice.mockRejectedValueOnce(Object.assign(new Error('card_declined'), { statusCode: 402 }));
    await expect(stripeAdapter.payInvoice('in_1', 'idem-1')).rejects.toMatchObject({ name: 'VendorError', vendor: 'stripe', upstreamStatus: 402 });
    expect(stripeMocks.payInvoice).toHaveBeenCalledWith({ stripeInvoiceId: 'in_1', idempotencyKey: 'idem-1' });
  });
});
