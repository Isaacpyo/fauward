import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { invoiceBalance } from '../../services/platform-billing.service.js';
import { resolveTenantEntitlements } from '../../services/tenant-entitlements.service.js';
import { planService } from './plan.service.js';

function currentMonth(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// "Invoices from Fauward" (D4): the tenant's own PLATFORM ledger — what Fauward billed this workspace — never its
// customers' invoices. Amounts are Decimal strings with the row's currency.

export async function registerTenantPlatformInvoiceRoutes(app: FastifyInstance) {
  // What Fauward bills this workspace and how much of the plan it uses (WP-2.0: replaces the portal's invented prices,
  // renewal dates and seat counts). Fields Fauward does not hold are null, never guessed.
  app.get('/api/v1/tenants/me/billing/summary', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = request.tenant?.id ?? request.user?.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
    const tenant = await app.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { id: true, plan: true, status: true, maxStaff: true, maxShipmentsPm: true, maxOrganisations: true, limitsOverriddenAt: true }
    });
    if (!tenant) return reply.status(404).send({ error: 'TENANT_NOT_FOUND' });
    const [entitlements, subscription, usage, staffUsed] = await Promise.all([
      resolveTenantEntitlements(app.prisma, tenant),
      app.prisma.subscription.findFirst({ where: { tenantId } }),
      app.prisma.usageRecord.findUnique({ where: { tenantId_month: { tenantId, month: currentMonth() } } }),
      app.prisma.user.count({ where: { tenantId, isActive: true, role: { notIn: ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] } } })
    ]);
    const cycle = subscription?.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
    const listPrice = planService.getPrice(String(tenant.plan));
    return reply.send({
      billingPlan: entitlements.billingPlan,
      effectivePlan: entitlements.effectivePlan,
      tenantStatus: tenant.status,
      subscription: subscription
        ? {
            status: subscription.status,
            billingCycle: cycle,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
            trialEnd: subscription.trialEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            managedByStripe: Boolean(subscription.stripeSubscriptionId)
          }
        : null,
      price: listPrice ? { amount: cycle === 'ANNUAL' ? listPrice.annual : listPrice.monthly, currency: listPrice.currency, cycle } : null,
      usage: {
        month: currentMonth(),
        shipments: { used: usage?.shipments ?? 0, limit: entitlements.limits.maxShipmentsPm },
        staff: { used: staffUsed, limit: entitlements.limits.maxStaff },
        apiCallsThisMonth: usage?.apiCalls ?? 0
      }
    });
  });

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
