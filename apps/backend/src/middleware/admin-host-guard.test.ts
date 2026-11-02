import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { VENDOR_WEBHOOK_PATHS } from '../config/vendor-webhooks.js';
import { createAdminHostGuard, isAdminRoutePath, isHostAgnosticPath, normalizeRequestHost } from './admin-host-guard.js';

function buildGuardedApp(enabled = true) {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', createAdminHostGuard({
    enabled,
    adminHostname: 'admin.fauward.com'
  }));

  app.get('/admin/auth/login', async () => ({ route: 'admin-auth' }));
  app.get('/api/internal/audit/entries', async () => ({ route: 'internal-audit' }));
  app.get('/api/v1/platform/auth/me', async () => ({ route: 'platform-auth' }));
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
    expect(isAdminRoutePath('/api/v1/platformer')).toBe(false);
    expect(isAdminRoutePath('/api/v1/tenant/me')).toBe(false);
  });

  it.each([
    '/admin/auth/login',
    '/api/internal/audit/entries',
    '/api/v1/platform/auth/me'
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
      url: '/api/v1/platform/auth/me',
      headers: { host: 'acme.fauward.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ route: 'platform-auth' });
  });
});

describe('admin host guard allowlist (WP-5.5, S15)', () => {
  const savedSecret = process.env.PAGERDUTY_WEBHOOK_SECRET;
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.PAGERDUTY_WEBHOOK_SECRET;
    else process.env.PAGERDUTY_WEBHOOK_SECRET = savedSecret;
  });

  it('ACC-HOST-1 with phase 1 on, a signed PagerDuty webhook on the API host is accepted; a console route on the API host is 404', async () => {
    process.env.PAGERDUTY_WEBHOOK_SECRET = 'pd_host_secret';
    const app = Fastify({ logger: false });
    app.decorate('prisma', {} as never);
    app.addHook('onRequest', createAdminHostGuard({ enabled: true, adminHostname: 'admin.fauward.com' }));
    const { registerConsoleIncidentRoutes } = await import('../modules/internal/platform/incidents.routes.js');
    await registerConsoleIncidentRoutes(app);
    app.get('/api/internal/metrics/queues', async () => ({ route: 'monitoring' }));

    const payload = { event: { event_type: 'incident.triggered', data: {} } };
    const signature = createHmac('sha256', 'pd_host_secret').update(JSON.stringify(payload)).digest('hex');
    const webhook = await app.inject({
      method: 'POST',
      url: '/api/internal/incidents/webhooks/pagerduty',
      headers: { host: 'api.fauward.com', 'x-pagerduty-signature': `v1=${signature}`, 'x-pagerduty-request-timestamp': String(Date.now()) },
      payload
    });
    expect(webhook.statusCode).toBe(202);
    expect(webhook.json()).toMatchObject({ received: true });

    const forged = await app.inject({ method: 'POST', url: '/api/internal/incidents/webhooks/pagerduty', headers: { host: 'api.fauward.com', 'x-pagerduty-signature': 'v1=forged', 'x-pagerduty-request-timestamp': String(Date.now()) }, payload });
    // Refused by the signature check itself (403), not hidden by the host guard (404).
    expect(forged.statusCode).toBe(403);

    expect((await app.inject({ method: 'GET', url: '/api/internal/incidents', headers: { host: 'api.fauward.com' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/internal/metrics/queues', headers: { host: 'api.fauward.com' } })).statusCode).toBe(200);
    await app.close();
  });

  it('only vendor webhooks and monitoring are host-agnostic', () => {
    for (const path of VENDOR_WEBHOOK_PATHS) expect(isHostAgnosticPath(`${path}?x=1`)).toBe(true);
    expect(isHostAgnosticPath('/api/internal/metrics/business-health')).toBe(true);
    expect(isHostAgnosticPath('/api/internal/integrations/webhooks/deliveries/d_1/replay')).toBe(false);
    expect(isHostAgnosticPath('/api/internal/metricsx')).toBe(false);
    expect(isHostAgnosticPath('/api/internal/tenants')).toBe(false);
  });
});
