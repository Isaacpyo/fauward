import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../../shared/utils/jwt.js';

// ACC-L15-2: the control-tower and cross-tenant tracking views moved from /api/v1/platform (tenant JWT, role
// SUPER_ADMIN) to /api/internal/operations on the console session. A legacy tenant token is refused before any query.

describe('operations routes on console auth (WP-2.11)', () => {
  it('ACC-L15-2 a legacy SUPER_ADMIN tenant JWT is 401 on every moved route and nothing is queried', async () => {
    const prisma = new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn(async () => { throw new Error('no query expected'); }) }) });
    const app = Fastify();
    await app.register(cookie);
    app.decorate('prisma', prisma as never);
    app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
    const { registerConsoleEscalationRoutes } = await import('./escalations.routes.js');
    await registerConsoleEscalationRoutes(app);
    const legacy = signAccessToken({ sub: 'u_root', email: 'root@tenant.test', role: 'SUPER_ADMIN', tenantId: 'tenant_a', tenantSlug: 'tenant-a', plan: 'ENTERPRISE', mfaVerified: true });
    const urls = [
      '/api/internal/operations/control-tower/health',
      '/api/internal/operations/control-tower/tenants/tenant_a/health',
      '/api/internal/operations/tracking',
      '/api/internal/operations/tracking/exceptions',
      '/api/internal/operations/tracking/stuck',
      '/api/internal/operations/tracking/health',
      '/api/internal/operations/tracking/tenants/tenant_a/shipments/sh_1',
      '/api/internal/operations/escalations'
    ];
    for (const url of urls) {
      const response = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${legacy}` } });
      expect(response.statusCode, url).toBe(401);
    }
    expect((await app.inject({ method: 'GET', url: '/api/v1/platform/control-tower/health', headers: { authorization: `Bearer ${legacy}` } })).statusCode).toBe(404);
    await app.close();
  });
});
