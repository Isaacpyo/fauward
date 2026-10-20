import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../queues/queues.js', () => ({
  notificationQueue: {},
  webhookQueue: {},
  outboxQueue: {},
  pdfQueue: {},
  analyticsQueue: {},
  scheduledJobsQueue: {},
  routeOptimizationQueue: {}
}));
vi.mock('@fauward/relay-api', () => ({ getRelayAdminClient: vi.fn() }));

// Imported once under the test environment: config is parsed at import time.
const { registerMonitoringRoutes, requireMonitoringKey } = await import('./monitoring.routes.js');

const originalEnv = { ...process.env };
const openApps: FastifyInstance[] = [];

async function buildApp() {
  const app = Fastify();
  openApps.push(app);
  app.get('/api/internal/metrics/probe', { preHandler: [requireMonitoringKey] }, async () => ({ ok: true }));
  return app;
}

afterEach(async () => {
  process.env = { ...originalEnv };
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('monitoring key (S8)', () => {
  it('ACC-SEC-1 without MONITORING_API_KEY in production the endpoints return 503', async () => {
    delete process.env.MONITORING_API_KEY;
    process.env.NODE_ENV = 'production';
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/internal/metrics/probe' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'MONITORING_NOT_CONFIGURED' });
  });

  it('ACC-SEC-1 an unset NODE_ENV also fails closed', async () => {
    delete process.env.MONITORING_API_KEY;
    delete process.env.NODE_ENV;
    const app = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/api/internal/metrics/probe' })).statusCode).toBe(503);
  });

  it('ACC-SEC-1 with the key, a wrong bearer gets 401 and the right one passes', async () => {
    process.env.MONITORING_API_KEY = 'monitoring-secret-value';
    process.env.NODE_ENV = 'production';
    const app = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/api/internal/metrics/probe' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/internal/metrics/probe', headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
    const ok = await app.inject({ method: 'GET', url: '/api/internal/metrics/probe', headers: { authorization: 'Bearer monitoring-secret-value' } });
    expect(ok.statusCode).toBe(200);
  });

  it('development without a key stays open (with a warning)', async () => {
    delete process.env.MONITORING_API_KEY;
    process.env.NODE_ENV = 'development';
    const app = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/api/internal/metrics/probe' })).statusCode).toBe(200);
  });

  it('every monitoring route is registered behind the key guard', async () => {
    const app = Fastify();
    openApps.push(app);
    const guarded: string[] = [];
    app.addHook('onRoute', (route) => {
      if (route.method === 'GET' && [route.preHandler].flat().some((handler) => handler === requireMonitoringKey)) guarded.push(route.url);
    });
    app.decorate('prisma', {} as never);
    await registerMonitoringRoutes(app);
    expect(guarded.sort()).toEqual(['/api/internal/metrics/business-health', '/api/internal/metrics/custom-domains', '/api/internal/metrics/queues', '/api/internal/metrics/relay-health']);
  });
});
