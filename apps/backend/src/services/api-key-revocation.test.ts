import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

// L9 (WP-2.13): staff revoke a tenant API key from the console → the key fails with 401 on its next request → the
// tenant's admins are told why. Tenant-side create/revoke record activity; key hashes never leave the API.

let permissions: Permission[] = ['platform.tenants.write'];
const notifyTenantAdmins = vi.hoisted(() => vi.fn(async (_app: unknown, _input: Record<string, unknown>) => ({ inApp: 1, emailsQueued: 1 })));
const auditMock = vi.hoisted(() => vi.fn(async (_db: unknown, _input: Record<string, unknown>) => ({ id: 'aud' })));
vi.mock('../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_1', email: 'sec@fauward.com', name: 'Sec Ops', role: null, mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../middleware/require-console-permission.js', () => {
  type ReplyLike = { status: (code: number) => { send: (body: unknown) => unknown } };
  return {
    requireConsolePermission: (permission: Permission) => async (_request: unknown, reply: ReplyLike) => (permissions.includes(permission) ? undefined : reply.status(403).send({ error: 'Forbidden' })),
    requireAnyConsolePermission: () => async () => undefined,
    consoleUserHas: async () => true
  };
});
vi.mock('./platform-audit.service.js', () => ({ writePlatformAuditLog: auditMock }));
vi.mock('./platform-notifier.service.js', () => ({ notifyTenantAdmins }));

const TOKEN = 'fw_test_compromised_key_value';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

type KeyRow = { id: string; tenantId: string; keyHash: string; keyPrefix: string; isActive: boolean; expiresAt: Date | null; revokedAt: Date | null; revokedByType: string | null; revokedById: string | null; revokedReason: string | null; [key: string]: unknown };

function createStore() {
  const keys: KeyRow[] = [
    { id: 'key_1', tenantId: 'tenant_a', name: 'ERP', keyHash: hash(TOKEN), keyPrefix: 'fw_test_comp', scopes: ['shipments:read'], rateLimit: 500, isSandbox: false, lastUsed: null, lastUsedAt: null, monthlyRequestCount: 4, isActive: true, expiresAt: null, createdAt: new Date(), revokedAt: null, revokedByType: null, revokedById: null, revokedReason: null }
  ];
  const activity: Array<Record<string, unknown>> = [];
  const matches = (row: KeyRow, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => (key === 'OR' ? true : row[key] === value));
  return {
    keys,
    activity,
    tenant: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'tenant_a' ? { id: 'tenant_a' } : null)) },
    apiKey: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = keys.find((key) => matches(key, where));
        return row ? { ...row, tenant: { id: 'tenant_a', slug: 'northwind', plan: 'PRO' } } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<KeyRow> }) => {
        const hit = keys.filter((key) => matches(key, where));
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      })
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

async function buildConsoleApp() {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', store as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerConsoleTenantRoutes } = await import('../modules/internal/platform/tenants.routes.js');
  await registerConsoleTenantRoutes(app);
  return app;
}

async function callWithKey() {
  const { authenticate } = await import('../shared/middleware/authenticate.js');
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    raw: { once: vi.fn() },
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: unknown) {
      sent.body = body;
      return this;
    }
  };
  const request = { method: 'GET', url: '/api/v1/shipments', headers: { authorization: `Bearer ${TOKEN}` }, server: { prisma: store } };
  await authenticate(request as unknown as FastifyRequest, reply as unknown as FastifyReply);
  return sent;
}

beforeEach(() => {
  permissions = ['platform.tenants.write'];
  store = createStore();
  notifyTenantAdmins.mockClear();
  auditMock.mockClear();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('L9 API key revocation (WP-2.13)', () => {
  it('ACC-L9-1 staff revoke makes the key fail with 401 immediately and notifies the tenant admins with the reason', async () => {
    expect(await store.apiKey.findFirst({ where: { keyHash: hash(TOKEN), isActive: true } })).not.toBeNull();
    const app = await buildConsoleApp();
    const revoked = await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_a/api-keys/key_1/revoke', payload: { reason: 'Key posted in a public GitHub repo' } });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({ key: { id: 'key_1', isActive: false, revokedBy: 'FAUWARD', revokedReason: 'Key posted in a public GitHub repo' } });
    expect(revoked.body).not.toContain('keyHash');

    expect(await callWithKey()).toEqual({ status: 401, body: { error: 'Invalid API key' } });
    expect(store.activity).toEqual([expect.objectContaining({ service: 'customer.360', type: 'api_key.revoked', tenantId: 'tenant_a', actorType: 'STAFF', severity: 'ATTENTION' })]);
    expect(notifyTenantAdmins).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 'tenant_a', event: 'api_key.revoked', body: 'Key posted in a public GitHub repo', email: { template: 'api_key_revoked_by_fauward', data: { keyPrefix: 'fw_test_comp…', reason: 'Key posted in a public GitHub repo' } } }));
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'TENANT_API_KEY_REVOKED', targetTenantId: 'tenant_a' }));

    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_a/api-keys/key_1/revoke', payload: { reason: 'Key posted in a public GitHub repo' } })).statusCode).toBe(409);
  });

  it('revoke is dangerous: reason, permission and the tenant must match', async () => {
    const app = await buildConsoleApp();
    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_a/api-keys/key_1/revoke', payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_b/api-keys/key_1/revoke', payload: { reason: 'Wrong tenant entirely' } })).statusCode).toBe(404);
    permissions = ['platform.tenants.read'];
    expect((await app.inject({ method: 'POST', url: '/api/internal/tenants/tenant_a/api-keys/key_1/revoke', payload: { reason: 'Key posted in a public repo' } })).statusCode).toBe(403);
    expect(store.keys[0].isActive).toBe(true);
  });
});
