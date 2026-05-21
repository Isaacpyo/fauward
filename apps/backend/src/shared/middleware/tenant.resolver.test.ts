import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { tenantResolver } from './tenant.resolver.js';

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-a',
    slug: 'tenant-a',
    name: 'Tenant A',
    plan: 'PRO',
    region: 'uk_europe',
    status: 'ACTIVE',
    customDomain: null,
    customDomainStatus: 'NONE',
    ...overrides
  };
}

async function buildApp(tenants: Array<ReturnType<typeof tenant>>) {
  const app = Fastify();
  const prisma = {
    tenant: {
      findFirst: vi.fn(async ({ where }: any) => tenants.find((row) =>
        row.customDomain === where.customDomain &&
        row.customDomainStatus === where.customDomainStatus
      ) ?? null),
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) return tenants.find((row) => row.id === where.id) ?? null;
        if (where.slug) return tenants.find((row) => row.slug === where.slug) ?? null;
        return null;
      })
    },
    tenantSlugHistory: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const row = where.oldSlug === 'old-tenant'
          ? {
              tenantId: 'tenant-a',
              oldSlug: 'old-tenant',
              expiresAt: new Date(Date.now() + 60_000),
              tenant: tenants.find((tenantRow) => tenantRow.id === 'tenant-a')
            }
          : null;
        if (!row) return null;
        return include?.tenant ? row : { tenantId: row.tenantId, oldSlug: row.oldSlug, expiresAt: row.expiresAt };
      })
    }
  };

  (app as any).decorate('prisma', prisma);
  app.addHook('onRequest', (request, reply, done) => {
    (async () => {
      await tenantResolver(request, reply);
      done();
    })().catch(done);
  });
  app.get('/api/v1/tenant/me', async (request: any) => ({ slug: request.tenant?.slug }));
  app.get('/api/v1/t/:tenantSlug/tenant/me', async (request: any) => ({ slug: request.tenant?.slug }));
  app.get('/api/v1/tracking/:trackingNumber', async (request: any) => ({ slug: request.tenant?.slug }));
  app.post('/api/v1/auth/login', async (request: any) => ({ slug: request.tenant?.slug ?? 'system' }));
  return { app, prisma };
}

describe('tenantResolver custom domains', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) {
      const ctx = apps.pop();
      if (ctx) await ctx.app.close();
    }
  });

  it('routes active custom domains', async () => {
    const ctx = await buildApp([tenant({ slug: 'custom', customDomain: 'track.example.com', customDomainStatus: 'ACTIVE' })]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tenant/me',
      headers: { host: 'track.example.com:443' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slug: 'custom' });
    expect(ctx.prisma.tenant.findFirst).toHaveBeenCalledWith({
      where: { customDomain: 'track.example.com', customDomainStatus: 'ACTIVE' }
    });
  });

  it('does not route pending custom domains', async () => {
    const ctx = await buildApp([tenant({ slug: 'pending', customDomain: 'pending.example.com', customDomainStatus: 'PENDING_DNS' })]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tenant/me',
      headers: { host: 'pending.example.com' }
    });

    expect(response.statusCode).toBe(404);
  });

  it('checks custom domain before subdomain routing', async () => {
    const ctx = await buildApp([
      tenant({ slug: 'slug-tenant' }),
      tenant({ slug: 'custom-tenant', customDomain: 'slug-tenant.fauward.com', customDomainStatus: 'ACTIVE' })
    ]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tenant/me',
      headers: { host: 'slug-tenant.fauward.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slug: 'custom-tenant' });
  });

  it('does not match platform lookalike domains with suffix includes behavior', async () => {
    const ctx = await buildApp([tenant({ slug: 'evil' })]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tenant/me',
      headers: { host: 'evil-fauward.com' }
    });

    expect(response.statusCode).toBe(404);
    expect(ctx.prisma.tenant.findUnique).not.toHaveBeenCalledWith({ where: { slug: 'evil' } });
  });

  it('uses active custom-domain host before tracking query tenant identifiers', async () => {
    const ctx = await buildApp([
      tenant({ id: 'tenant-a', slug: 'tenant-a', customDomain: 'track.example.com', customDomainStatus: 'ACTIVE' }),
      tenant({ id: 'tenant-b', slug: 'tenant-b' })
    ]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tracking/FW-1?tenant=tenant-b',
      headers: { host: 'track.example.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slug: 'tenant-a' });
  });

  it('resolves active custom domains on public auth routes', async () => {
    const ctx = await buildApp([
      tenant({ id: 'tenant-a', slug: 'tenant-a', customDomain: 'track.example.com', customDomainStatus: 'ACTIVE' })
    ]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { host: 'track.example.com' },
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slug: 'tenant-a' });
  });

  it('resolves path tenant slug before platform host system context', async () => {
    const ctx = await buildApp([tenant({ id: 'tenant-a', slug: 'tenant-a' })]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/t/tenant-a/tenant/me',
      headers: { host: 'app.fauward.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slug: 'tenant-a' });
  });

  it('redirects old path slugs to the current slug', async () => {
    const ctx = await buildApp([tenant({ id: 'tenant-a', slug: 'tenant-a' })]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/t/old-tenant/tenant/me',
      headers: { host: 'app.fauward.com' }
    });

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('/api/v1/t/tenant-a/tenant/me');
  });

  it('attaches current tenant and deprecation headers for old header slugs', async () => {
    const ctx = await buildApp([tenant({ id: 'tenant-a', slug: 'tenant-a' })]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tenant/me',
      headers: { host: 'app.fauward.com', 'x-tenant-slug': 'old-tenant' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slug: 'tenant-a' });
    expect(response.headers['x-tenant-slug-deprecated']).toBe('old-tenant');
    expect(response.headers['x-tenant-slug-current']).toBe('tenant-a');
  });

  it('does not query tenants for platform probe routes', async () => {
    const ctx = await buildApp([
      tenant({ id: 'tenant-a', slug: 'tenant-a', customDomain: 'track.example.com', customDomainStatus: 'ACTIVE' })
    ]);
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'track.example.com' }
    });

    expect(response.statusCode).toBe(404);
    expect(ctx.prisma.tenant.findFirst).not.toHaveBeenCalled();
    expect(ctx.prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});
