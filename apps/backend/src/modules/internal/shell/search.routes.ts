import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { consoleUserHas } from '../../../middleware/require-console-permission.js';

// GET /api/internal/search?q= (architecture §9.9): tenants, staff, tickets and invoices, each section only when the
// caller can read it. Feeds the command palette.

const query = z.object({ q: z.string().trim().min(2).max(100), limit: z.coerce.number().int().min(1).max(10).default(5) });

export async function registerConsoleSearchRoutes(app: FastifyInstance) {
  app.get('/api/internal/search', { preHandler: [authenticatePlatformSession] }, async (request, reply) => {
    const parsed = query.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: 'q must be 2–100 characters' });
    const { q, limit } = parsed.data;
    const contains = { contains: q, mode: 'insensitive' as const };

    const [canTenants, canStaff, canTickets, canInvoices] = await Promise.all([
      consoleUserHas(request, 'platform.tenants.read'),
      consoleUserHas(request, 'trust.iam.read'),
      consoleUserHas(request, 'customer.support.read'),
      consoleUserHas(request, 'revenue.invoices.read')
    ]);

    const [tenants, staff, tickets, invoices] = await Promise.all([
      canTenants
        ? app.prisma.tenant.findMany({
            where: { OR: [{ name: contains }, { slug: contains }, { customDomain: contains }] },
            select: { id: true, name: true, slug: true, status: true, plan: true },
            orderBy: { name: 'asc' },
            take: limit
          })
        : null,
      canStaff
        ? app.prisma.staffUser.findMany({ where: { OR: [{ email: contains }, { name: contains }] }, select: { id: true, name: true, email: true, status: true }, orderBy: { name: 'asc' }, take: limit })
        : null,
      canTickets
        ? app.prisma.supportTicket.findMany({
            where: { ticketNumber: contains },
            select: { id: true, ticketNumber: true, subject: true, status: true, tenantId: true, tenant: { select: { name: true, slug: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit
          })
        : null,
      canInvoices
        ? app.prisma.invoice.findMany({
            where: { invoiceNumber: contains },
            select: { id: true, invoiceNumber: true, status: true, total: true, currency: true, tenantId: true, tenant: { select: { name: true, slug: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit
          })
        : null
    ]);

    // A null section means "not permitted", which the palette shows as locked rather than empty.
    return reply.send({
      q,
      tenants,
      staff,
      tickets,
      invoices: invoices?.map((invoice) => ({ ...invoice, total: invoice.total.toFixed(2) })) ?? null
    });
  });
}
