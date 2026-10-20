import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';

// Tenant portal command palette (WP-2.0): shipments by tracking number, business customers by name, the workspace's
// own customer invoices by number. Every query is scoped to the caller's tenant; invoices only for roles that can see
// finance.

export type TenantSearchResult = {
  id: string;
  type: 'shipment' | 'customer' | 'invoice';
  label: string;
  subtitle: string;
  href: string;
};

const searchQuery = z.object({ q: z.string().trim().min(2).max(100) });
const PER_TYPE = 5;
const FINANCE_ROLES = new Set(['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_FINANCE']);

export async function registerTenantSearchRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/search',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_FINANCE', 'TENANT_STAFF'])] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const parsed = searchQuery.safeParse(request.query ?? {});
      if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION', message: 'q must be 2 to 100 characters.' });
      const q = parsed.data.q;
      const canSeeFinance = FINANCE_ROLES.has(String(request.user?.role ?? ''));

      const [shipments, customers, invoices] = await Promise.all([
        app.prisma.shipment.findMany({
          where: { tenantId, trackingNumber: { contains: q, mode: 'insensitive' } },
          select: { id: true, trackingNumber: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: PER_TYPE
        }),
        app.prisma.organisation.findMany({
          where: { tenantId, name: { contains: q, mode: 'insensitive' } },
          select: { id: true, name: true, billingEmail: true },
          orderBy: { name: 'asc' },
          take: PER_TYPE
        }),
        canSeeFinance
          ? app.prisma.invoice.findMany({
              where: { kind: 'TENANT_CUSTOMER', tenantId, invoiceNumber: { contains: q, mode: 'insensitive' } },
              select: { id: true, invoiceNumber: true, status: true },
              orderBy: { createdAt: 'desc' },
              take: PER_TYPE
            })
          : Promise.resolve([])
      ]);

      const results: TenantSearchResult[] = [
        ...shipments.map((shipment) => ({ id: shipment.id, type: 'shipment' as const, label: shipment.trackingNumber, subtitle: `Shipment · ${shipment.status}`, href: `/shipments/${shipment.id}` })),
        ...customers.map((customer) => ({ id: customer.id, type: 'customer' as const, label: customer.name, subtitle: `Customer${customer.billingEmail ? ` · ${customer.billingEmail}` : ''}`, href: `/crm/${customer.id}` })),
        ...invoices.map((invoice) => ({ id: invoice.id, type: 'invoice' as const, label: invoice.invoiceNumber, subtitle: `Invoice · ${invoice.status}`, href: `/finance/${invoice.id}` }))
      ];
      return reply.send(results);
    }
  );
}
