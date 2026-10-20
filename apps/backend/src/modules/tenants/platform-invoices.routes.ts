import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { invoiceBalance } from '../../services/platform-billing.service.js';

// "Invoices from Fauward" (D4): the tenant's own PLATFORM ledger — what Fauward billed this workspace — never its
// customers' invoices. Amounts are Decimal strings with the row's currency.

export async function registerTenantPlatformInvoiceRoutes(app: FastifyInstance) {
  app.get('/api/v1/tenants/me/billing/invoices', { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_FINANCE'])] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const [invoices, refunds] = await Promise.all([
      app.prisma.invoice.findMany({
        where: { tenantId, kind: 'PLATFORM', status: { not: 'DRAFT' } },
        include: { payments: { where: { kind: 'PLATFORM' } }, creditNotes: { where: { kind: 'PLATFORM' } } },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      app.prisma.refund.findMany({
        where: { tenantId, kind: 'PLATFORM', status: { in: ['SUCCEEDED', 'RECORDED_MANUAL'] } },
        select: { id: true, paymentId: true, amount: true, currency: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    ]);
    return reply.send({
      invoices: invoices.map(({ payments, creditNotes, ...invoice }) => {
        const balance = invoiceBalance({ total: invoice.total, payments, creditNotes });
        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          currency: invoice.currency,
          subtotal: invoice.subtotal.toFixed(2),
          taxAmount: invoice.taxAmount.toFixed(2),
          total: invoice.total.toFixed(2),
          paid: balance.paid.toFixed(2),
          credited: balance.credited.toFixed(2),
          outstanding: balance.outstanding.toFixed(2),
          lineItems: invoice.lineItems,
          dueDate: invoice.dueDate?.toISOString() ?? null,
          sentAt: invoice.sentAt?.toISOString() ?? null,
          paidAt: invoice.paidAt?.toISOString() ?? null,
          createdAt: invoice.createdAt.toISOString(),
          creditNotes: creditNotes.map((credit) => ({ id: credit.id, creditNumber: credit.creditNumber, amount: credit.amount.toFixed(2), currency: credit.currency, reason: credit.reason, createdAt: credit.createdAt.toISOString() }))
        };
      }),
      refunds: refunds.map((refund) => ({ ...refund, amount: refund.amount.toFixed(2), createdAt: refund.createdAt.toISOString() }))
    });
  });
}
