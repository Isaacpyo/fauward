import Fastify, { type FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

let permissions: string[] = [];
vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_1', email: 'csm@fauward.com' }, session: { id: 'ps_1' } };
  }
}));
vi.mock('../../../middleware/require-console-permission.js', () => ({ consoleUserHas: async (_request: unknown, permission: string) => permissions.includes(permission) }));

const openApps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('GET /api/internal/search (architecture §9.9)', () => {
  it('returns only the sections the caller may read; the others are null (locked), not empty', async () => {
    permissions = ['platform.tenants.read', 'revenue.invoices.read'];
    const prisma = {
      tenant: { findMany: vi.fn(async () => [{ id: 't_1', name: 'Northwind', slug: 'northwind', status: 'ACTIVE', plan: 'PRO' }]) },
      staffUser: { findMany: vi.fn() },
      supportTicket: { findMany: vi.fn() },
      invoice: { findMany: vi.fn(async () => [{ id: 'inv_1', invoiceNumber: 'INV-NW-1', status: 'SENT', total: new Prisma.Decimal('79'), currency: 'GBP', tenantId: 't_1', tenant: { name: 'Northwind', slug: 'northwind' } }]) }
    };
    const app = Fastify();
    openApps.push(app);
    app.decorate('prisma', prisma as never);
    const { registerConsoleSearchRoutes } = await import('./search.routes.js');
    await registerConsoleSearchRoutes(app);

    const response = await app.inject({ method: 'GET', url: '/api/internal/search?q=north' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ tenants: [{ id: 't_1' }], staff: null, tickets: null, invoices: [{ invoiceNumber: 'INV-NW-1', total: '79.00', currency: 'GBP' }] });
    expect(prisma.staffUser.findMany).not.toHaveBeenCalled();
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ name: { contains: 'north', mode: 'insensitive' } }, { slug: { contains: 'north', mode: 'insensitive' } }, { customDomain: { contains: 'north', mode: 'insensitive' } }] } }));
    expect((await app.inject({ method: 'GET', url: '/api/internal/search?q=n' })).statusCode).toBe(400);
  });
});
