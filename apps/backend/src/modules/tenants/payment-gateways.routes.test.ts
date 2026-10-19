import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptField, generateFieldEncryptionKey } from '../../services/crypto/field-encryption.js';

// L11 (WP-2.12): tenant payment gateways are saved through the API with encrypted secrets; responses never carry a
// secret; "Test connection" asks the provider and a failure notifies the tenant's admins. Fixture keys are made up.

process.env.FIELD_ENCRYPTION_KEYS = JSON.stringify({ test: generateFieldEncryptionKey() });
process.env.FIELD_ENCRYPTION_ACTIVE_KEY_ID = 'test';

let role = 'TENANT_ADMIN';
const notifyTenantAdmins = vi.hoisted(() => vi.fn(async (_app: unknown, _input: Record<string, unknown>) => ({ inApp: 1, emailsQueued: 1 })));
vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: 'u_admin', email: 'admin@northwind.test', role, tenantId: 'tenant_a' };
    request.tenant = { id: 'tenant_a' };
  }
}));
vi.mock('../../services/platform-notifier.service.js', () => ({ notifyTenantAdmins }));

type Row = Record<string, unknown> & { id: string; tenantId: string; provider: string };

function createStore() {
  const rows: Row[] = [];
  const activity: Array<Record<string, unknown>> = [];
  const settings: Record<string, unknown> = { tenantId: 'tenant_a', paymentGateway: 'STRIPE' };
  const find = (where: { tenantId_provider?: { tenantId: string; provider: string }; id?: string }) =>
    rows.find((row) => (where.id ? row.id === where.id : row.tenantId === where.tenantId_provider?.tenantId && row.provider === where.tenantId_provider?.provider)) ?? null;
  return {
    rows,
    activity,
    settings,
    tenantPaymentGateway: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) => rows.filter((row) => row.tenantId === where.tenantId)),
      findUnique: vi.fn(async ({ where }: { where: { tenantId_provider: { tenantId: string; provider: string } } }) => find(where)),
      upsert: vi.fn(async ({ where, create, update }: { where: { tenantId_provider: { tenantId: string; provider: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = find(where);
        if (existing) return Object.assign(existing, update, { updatedAt: new Date() });
        const row: Row = { id: `gw_${rows.length + 1}`, tenantId: where.tenantId_provider.tenantId, provider: where.tenantId_provider.provider, lastVerifiedAt: null, lastError: null, createdAt: new Date(), updatedAt: new Date(), ...create };
        rows.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(find(where)!, data, { updatedAt: new Date() }))
    },
    tenantSettings: {
      findUnique: vi.fn(async () => ({ paymentGateway: settings.paymentGateway })),
      upsert: vi.fn(async ({ update }: { update: Record<string, unknown> }) => Object.assign(settings, update))
    },
    platformActivity: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        activity.push(create);
        return { id: `act_${activity.length}`, ...create };
      })
    }
  };
}

let store: ReturnType<typeof createStore>;
const openApps: FastifyInstance[] = [];

async function buildApp() {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', store as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerPaymentGatewayRoutes } = await import('./payment-gateways.routes.js');
  await registerPaymentGatewayRoutes(app);
  return app;
}

beforeEach(() => {
  role = 'TENANT_ADMIN';
  store = createStore();
  notifyTenantAdmins.mockClear();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('tenant payment gateways (L11, WP-2.12)', () => {
  it('saving stores the secret encrypted and never returns it; a new key is UNVERIFIED in TEST mode', async () => {
    const app = await buildApp();
    const saved = await app.inject({ method: 'PUT', url: '/api/v1/tenant/payment-gateways/paystack', payload: { enabled: true, publicKey: 'pk_test_abc', secretKey: 'sk_test_secret_value', config: { merchantEmail: 'pay@northwind.test' } } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ provider: 'PAYSTACK', enabled: true, mode: 'TEST', secretKeySet: true, status: 'UNVERIFIED', config: { merchantEmail: 'pay@northwind.test' } });
    expect(saved.body).not.toContain('sk_test_secret_value');
    expect(String(store.rows[0].secretKeyEncrypted)).toMatch(/^v1:/);
    expect(decryptField(String(store.rows[0].secretKeyEncrypted))).toBe('sk_test_secret_value');
    expect(store.activity).toEqual([expect.objectContaining({ service: 'platform.integrations', type: 'gateway.configured', tenantId: 'tenant_a', actorType: 'TENANT_USER' })]);

    // Omitting the secret keeps it; the list reports it as set and never shows it.
    await app.inject({ method: 'PUT', url: '/api/v1/tenant/payment-gateways/PAYSTACK', payload: { enabled: true, config: { merchantEmail: 'billing@northwind.test' } } });
    expect(decryptField(String(store.rows[0].secretKeyEncrypted))).toBe('sk_test_secret_value');
    const list = await app.inject({ method: 'GET', url: '/api/v1/tenant/payment-gateways' });
    expect(list.json().gateways).toHaveLength(5);
    expect(list.json().gateways.find((row: { provider: string }) => row.provider === 'PAYSTACK')).toMatchObject({ secretKeySet: true, config: { merchantEmail: 'billing@northwind.test' } });
    expect(list.body).not.toMatch(/sk_test_secret_value|v1:/);
  });

  it('test connection: provider OK → VERIFIED; provider rejects → FAILED with the error, activity and a tenant notice', async () => {
    const app = await buildApp();
    await app.inject({ method: 'PUT', url: '/api/v1/tenant/payment-gateways/STRIPE', payload: { enabled: true, secretKey: 'sk_test_secret_value' } });
    const fetchMock = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => ({ ok: init.headers.Authorization === 'Bearer sk_test_secret_value', status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    const ok = await app.inject({ method: 'POST', url: '/api/v1/tenant/payment-gateways/STRIPE/test' });
    expect(ok.json()).toMatchObject({ status: 'VERIFIED', lastError: null });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.stripe.com/v1/balance');

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API Key provided' } }) })));
    const failed = await app.inject({ method: 'POST', url: '/api/v1/tenant/payment-gateways/STRIPE/test' });
    expect(failed.json()).toMatchObject({ status: 'FAILED', lastError: 'STRIPE returned 401: Invalid API Key provided' });
    expect(store.activity.map((row) => row.type)).toEqual(['gateway.configured', 'gateway.verified', 'gateway.failed']);
    expect(notifyTenantAdmins).toHaveBeenCalledTimes(1);
    expect(notifyTenantAdmins).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 'tenant_a', event: 'gateway.failed', link: '/settings?tab=integrations', email: expect.objectContaining({ template: 'gateway_verification_failed' }) }));
  });

  it('offline methods take no keys and need no test; the default provider must be enabled; only admins and finance manage gateways', async () => {
    const app = await buildApp();
    expect((await app.inject({ method: 'PUT', url: '/api/v1/tenant/payment-gateways/COD', payload: { enabled: true, secretKey: 'nope' } })).statusCode).toBe(400);
    const cod = await app.inject({ method: 'PUT', url: '/api/v1/tenant/payment-gateways/COD', payload: { enabled: true, config: { remittanceWindowDays: 3, instructions: 'Hand cash to the depot' } } });
    expect(cod.json()).toMatchObject({ status: 'VERIFIED', testable: false });
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenant/payment-gateways/COD/test' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/v1/tenant/payment-gateways', payload: { activeProvider: 'FLUTTERWAVE' } })).statusCode).toBe(409);
    const made = await app.inject({ method: 'PATCH', url: '/api/v1/tenant/payment-gateways', payload: { activeProvider: 'COD' } });
    expect(made.json()).toMatchObject({ activeProvider: 'COD' });
    expect((await app.inject({ method: 'PUT', url: '/api/v1/tenant/payment-gateways/BITCOIN', payload: { enabled: true } })).statusCode).toBe(404);
    role = 'TENANT_STAFF';
    expect((await app.inject({ method: 'GET', url: '/api/v1/tenant/payment-gateways' })).statusCode).toBe(403);
  });
});
