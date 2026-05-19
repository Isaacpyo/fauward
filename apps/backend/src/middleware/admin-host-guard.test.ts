import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createAdminHostGuard, isAdminRoutePath, normalizeRequestHost } from './admin-host-guard.js';

function buildGuardedApp(enabled = true) {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', createAdminHostGuard({
    enabled,
    adminHostname: 'admin.fauward.com'
  }));

  app.get('/admin/auth/login', async () => ({ route: 'admin-auth' }));
  app.get('/api/internal/audit/entries', async () => ({ route: 'internal-audit' }));
  app.get('/api/v1/platform/auth/me', async () => ({ route: 'platform-auth' }));
  app.get('/api/v1/admin/tenants', async () => ({ route: 'legacy-admin' }));
  app.get('/api/v1/tenant/me', async () => ({ route: 'tenant' }));

  return app;
}

describe('admin host guard', () => {
  it('normalizes host headers before comparing them', () => {
    expect(normalizeRequestHost('Admin.Fauward.Com:443')).toBe('admin.fauward.com');
    expect(normalizeRequestHost('[::1]:3001')).toBe('::1');
  });

  it('recognizes admin route namespaces only on path boundaries', () => {
    expect(isAdminRoutePath('/admin/auth/login')).toBe(true);
    expect(isAdminRoutePath('/api/internal/audit/entries?limit=10')).toBe(true);
    expect(isAdminRoutePath('/api/v1/platform/auth/me')).toBe(true);
    expect(isAdminRoutePath('/api/v1/admin/tenants')).toBe(true);
    expect(isAdminRoutePath('/api/v1/administrator')).toBe(false);
    expect(isAdminRoutePath('/api/v1/tenant/me')).toBe(false);
  });

  it.each([
    '/admin/auth/login',
    '/api/internal/audit/entries',
    '/api/v1/platform/auth/me',
    '/api/v1/admin/tenants'
  ])('returns 404 for %s on the tenant hostname', async (url) => {
    const app = buildGuardedApp();

    const response = await app.inject({
      method: 'GET',
      url,
      headers: { host: 'acme.fauward.com' }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found'
    });
  });

  it('allows admin routes on the configured admin hostname', async () => {
    const app = buildGuardedApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/auth/me',
      headers: { host: 'admin.fauward.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ route: 'platform-auth' });
  });

  it('does not affect tenant routes on tenant hostnames', async () => {
    const app = buildGuardedApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenant/me',
      headers: { host: 'acme.fauward.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ route: 'tenant' });
  });

  it('allows rollback by disabling the Phase 1 flag', async () => {
    const app = buildGuardedApp(false);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/tenants',
      headers: { host: 'acme.fauward.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ route: 'legacy-admin' });
  });
});
