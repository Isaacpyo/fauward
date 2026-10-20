import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WP-2.0: the tenant command palette's search (it called a missing /api/search and showed canned results on failure).

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { headers: Record<string, unknown>; user?: unknown; tenant?: unknown }) => {
    request.user = { sub: 'u_1', role: String(request.headers['x-test-role'] ?? 'TENANT_ADMIN'), tenantId: 'tenant_a' };
    request.tenant = { id: 'tenant_a', slug: 'northwind' };
  }
}));

const shipmentFindMany = vi.fn();
const organisationFindMany = vi.fn();
const invoiceFindMany = vi.fn();

let app: FastifyInstance;

beforeEach(async () => {
  shipmentFindMany.mockReset().mockResolvedValue([{ id: 'ship_1', trackingNumber: 'NWD-2026-0001', status: 'IN_TRANSIT' }]);
  organisationFindMany.mockReset().mockResolvedValue([{ id: 'org_1', name: 'Acme Retail', billingEmail: 'ap@acme.test' }]);
  invoiceFindMany.mockReset().mockResolvedValue([{ id: 'inv_1', invoiceNumber: 'NWD-INV-0001', status: 'SENT' }]);
  app = Fastify();
  app.decorate('prisma', { shipment: { findMany: shipmentFindMany }, organisation: { findMany: organisationFindMany }, invoice: { findMany: invoiceFindMany } } as never);
  const { registerTenantSearchRoutes } = await import('./search.routes.js');
  await registerTenantSearchRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/v1/search (WP-2.0)', () => {
  it('returns shipments, customers and invoices of the caller tenant only, each with a portal link', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/search?q=nwd' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: 'ship_1', type: 'shipment', label: 'NWD-2026-0001', subtitle: 'Shipment · IN_TRANSIT', href: '/shipments/ship_1' },
      { id: 'org_1', type: 'customer', label: 'Acme Retail', subtitle: 'Customer · ap@acme.test', href: '/crm/org_1' },
      { id: 'inv_1', type: 'invoice', label: 'NWD-INV-0001', subtitle: 'Invoice · SENT', href: '/finance/inv_1' }
    ]);
    for (const call of [shipmentFindMany, organisationFindMany, invoiceFindMany]) {
      expect(call.mock.calls[0][0].where.tenantId).toBe('tenant_a');
    }
    expect(invoiceFindMany.mock.calls[0][0].where.kind).toBe('TENANT_CUSTOMER');
  });

  it('staff without finance access get no invoice results (and no invoice query)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/search?q=nwd', headers: { 'x-test-role': 'TENANT_STAFF' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().map((row: { type: string }) => row.type)).toEqual(['shipment', 'customer']);
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it('customers and drivers cannot search the workspace; a one-character query is rejected', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/search?q=nwd', headers: { 'x-test-role': 'CUSTOMER_USER' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/search?q=nwd', headers: { 'x-test-role': 'TENANT_DRIVER' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/search?q=n' })).statusCode).toBe(400);
  });
});
