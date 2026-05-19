import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const domainServiceMock = vi.hoisted(() => ({
  setCustomDomain: vi.fn(),
  checkStatus: vi.fn(),
  removeCustomDomain: vi.fn()
}));

vi.mock('./domain.service.js', async () => {
  const actual = await vi.importActual<typeof import('./domain.service.js')>('./domain.service.js');
  return { ...actual, domainService: domainServiceMock };
});

import { VercelApiError } from './infrastructure/vercel.client.js';
import { DomainBusinessError, DomainConflictError } from './domain.service.js';
import { registerDomainRoutes } from './domain.routes.js';

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-a',
    slug: 'tenant-a',
    name: 'Tenant A',
    plan: 'PRO',
    status: 'ACTIVE',
    customDomain: null,
    customDomainStatus: 'NONE',
    customDomainVerifiedAt: null,
    customDomainError: null,
    ...overrides
  };
}

async function buildApp() {
  const app = Fastify();
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.ban ? 403 : 429,
      error: 'Rate limit exceeded',
      code: 'RATE_LIMITED',
      retryAfter: Number(context.after ?? 60)
    })
  });
  (app as any).decorate('prisma', {});
  (app as any).decorate('authenticate', async (request: any, reply: any) => {
    if (!request.headers.authorization) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    request.user = {
      sub: 'user-a',
      tenantId: String(request.headers['x-test-user-tenant'] ?? request.tenant?.id ?? 'tenant-a'),
      plan: request.tenant?.plan ?? 'PRO',
      role: String(request.headers['x-test-role'] ?? 'TENANT_ADMIN')
    };
  });
  app.addHook('onRequest', (request: any, _reply, done) => {
    const plan = String(request.headers['x-test-plan'] ?? 'PRO');
    const tenantId = String(request.headers['x-test-tenant'] ?? 'tenant-a');
    request.tenant = tenant({ id: tenantId, slug: tenantId, plan });
    done();
  });
  await registerDomainRoutes(app as any);
  return app;
}

describe('custom domain routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    domainServiceMock.setCustomDomain.mockResolvedValue({
      tenant: tenant({ customDomain: 'track.example.com', customDomainStatus: 'PENDING_DNS' }),
      instructions: { type: 'CNAME', name: 'track', host: 'track.example.com', value: 'cname.vercel-dns-0.com', ttl: 3600 }
    });
    domainServiceMock.checkStatus.mockResolvedValue({
      status: 'PENDING_DNS',
      domain: 'track.example.com',
      instructions: { type: 'CNAME', name: 'track', host: 'track.example.com', value: 'cname.vercel-dns-0.com', ttl: 3600 },
      error: null,
      verifiedAt: null,
      lastCheckAt: null
    });
    domainServiceMock.removeCustomDomain.mockResolvedValue(tenant());
  });

  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('returns 401 for unauthenticated writes', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'PATCH', url: '/api/v1/tenant/domain', payload: { domain: 'track.example.com' } });

    expect(response.statusCode).toBe(401);
  });

  it('returns PLAN_REQUIRED for Starter tenants', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/domain',
      headers: { authorization: 'Bearer test', 'x-test-plan': 'STARTER' },
      payload: { domain: 'track.example.com' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'PLAN_REQUIRED' });
  });

  it('rejects writes when the authenticated user tenant does not match the host-resolved tenant', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/domain',
      headers: {
        authorization: 'Bearer test',
        'x-test-tenant': 'victim-tenant',
        'x-test-user-tenant': 'attacker-tenant'
      },
      payload: { domain: 'track.example.com' }
    });

    expect(response.statusCode).toBe(403);
    expect(domainServiceMock.setCustomDomain).not.toHaveBeenCalled();
  });

  it('rejects non-admin tenant users', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/domain',
      headers: { authorization: 'Bearer test', 'x-test-role': 'TENANT_STAFF' },
      payload: { domain: 'track.example.com' }
    });

    expect(response.statusCode).toBe(403);
    expect(domainServiceMock.setCustomDomain).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid domain format', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/domain',
      headers: { authorization: 'Bearer test' },
      payload: { domain: 'not a domain' }
    });

    expect(response.statusCode).toBe(400);
    expect(domainServiceMock.setCustomDomain).not.toHaveBeenCalled();
  });

  it('maps reserved domain business errors to 400', async () => {
    const app = await buildApp();
    apps.push(app);
    domainServiceMock.setCustomDomain.mockRejectedValueOnce(new DomainBusinessError('This domain is reserved', 'DOMAIN_RESERVED'));

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/domain',
      headers: { authorization: 'Bearer test' },
      payload: { domain: 'sub.fauward.com' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'DOMAIN_RESERVED' });
  });

  it('sets a valid Pro tenant domain', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/domain',
      headers: { authorization: 'Bearer test' },
      payload: { domain: 'https://Track.Example.com/path' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      tenant: { customDomain: 'track.example.com', customDomainStatus: 'PENDING_DNS' },
      instructions: { type: 'CNAME' }
    });
    expect(domainServiceMock.setCustomDomain).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      tenantId: 'tenant-a',
      domain: 'track.example.com'
    }));
  });

  it('maps duplicate domain conflicts to 409', async () => {
    const app = await buildApp();
    apps.push(app);
    domainServiceMock.setCustomDomain.mockRejectedValueOnce(new DomainConflictError('This domain is already in use by another Fauward tenant.'));

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/domain',
      headers: { authorization: 'Bearer test' },
      payload: { domain: 'track.example.com' }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'DOMAIN_TAKEN' });
  });

  it('returns status instructions while pending', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenant/domain/status',
      headers: { authorization: 'Bearer test' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'PENDING_DNS', instructions: { type: 'CNAME' } });
  });

  it('deletes idempotently', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/tenant/domain',
      headers: { authorization: 'Bearer test' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, tenant: { customDomain: null, customDomainStatus: 'NONE' } });
  });

  it('rate limits PATCH by tenant bucket', async () => {
    const app = await buildApp();
    apps.push(app);

    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(await app.inject({
        method: 'PATCH',
        url: '/api/v1/tenant/domain',
        headers: { authorization: 'Bearer test', 'x-test-tenant': 'tenant-rate' },
        payload: { domain: `track${index}.example.com` }
      }));
    }

    expect(responses[5].statusCode).toBe(429);
    expect(responses[5].json()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('rate limits status polling by tenant bucket', async () => {
    const app = await buildApp();
    apps.push(app);

    let last = await app.inject({
      method: 'GET',
      url: '/api/v1/tenant/domain/status',
      headers: { authorization: 'Bearer test', 'x-test-tenant': 'tenant-status-rate' }
    });
    for (let index = 1; index < 61; index += 1) {
      last = await app.inject({
        method: 'GET',
        url: '/api/v1/tenant/domain/status',
        headers: { authorization: 'Bearer test', 'x-test-tenant': 'tenant-status-rate' }
      });
    }

    expect(last.statusCode).toBe(429);
  });

  it('does not expose raw Vercel errors to users', async () => {
    const app = await buildApp();
    apps.push(app);
    domainServiceMock.setCustomDomain.mockRejectedValueOnce(new VercelApiError('project prj_secret failed', 500, 'internal'));

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tenant/domain',
      headers: { authorization: 'Bearer test' },
      payload: { domain: 'track.example.com' }
    });

    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('prj_secret');
    expect(response.json()).toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});
