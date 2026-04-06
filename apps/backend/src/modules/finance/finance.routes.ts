import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { InvoiceStatus, PaymentStatus, Prisma } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { resolveIdempotency, storeIdempotencyResult } from '../../shared/middleware/idempotency.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function yearPrefix(date = new Date()) {
  return date.getUTCFullYear();
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          const text = value === null || value === undefined ? '' : String(value).replaceAll('"', '""');
          return `"${text}"`;
        })
        .join(',')
    )
  ];
  return lines.join('\n');
}

async function nextInvoiceNumber(app: FastifyInstance, tenantId: string, tenantSlug: string) {
  const year = yearPrefix();
  const prefix = `${tenantSlug.toUpperCase()}-INV-${year}-`;
  const count = await app.prisma.invoice.count({
    where: {
      tenantId,
      invoiceNumber: { startsWith: prefix }
    }
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

export async function runOverdueInvoiceSweep(app: FastifyInstance) {
  const now = new Date();
  const overdueInvoices = await app.prisma.invoice.findMany({
    where: {
      status: 'SENT',
      dueDate: { lt: now }
    }
  });

  for (const invoice of overdueInvoices) {
    await app.prisma.$transaction([
      app.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'OVERDUE' }
      }),
      app.prisma.notificationLog.createMany({
        data: [
          {
            tenantId: invoice.tenantId,
            channel: 'EMAIL',
            event: 'invoice_overdue',
            status: 'QUEUED'
          }
        ]
      })
    ]);
  }

  return overdueInvoices.length;
}

export async function registerFinanceRoutes(app: FastifyInstance) {
  app.get('/api/v1/finance/invoices', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const invoices = await app.prisma.invoice.findMany({
      where: { tenantId },
      include: { organisation: true },
      orderBy: { createdAt: 'desc' }
    });
    reply.send({ data: invoices });
  });

  app.post('/api/v1/finance/invoices', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const idempotency = await resolveIdempotency(req, reply);
    if (idempotency.type === 'duplicate') return reply.status(idempotency.statusCode).send(idempotency.response);
    if (idempotency.type === 'processing') return reply.status(409).send({ error: 'Duplicate request in flight' });

    const payload = req.body as {
      shipmentId?: string;
      organisationId?: string;
      customerId?: string;
      lineItems?: Array<Record<string, unknown>>;
      subtotal?: number;
      taxRate?: number;
      taxAmount?: number;
      discountAmount?: number;
      total?: number;
      currency?: string;
      dueDate?: string;
      paymentTerms?: number;
      notes?: string;
    };

    const invoiceNumber = await nextInvoiceNumber(app, tenantId, req.tenant?.slug ?? 'TENANT');
    const invoice = await app.prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        shipmentId: payload.shipmentId,
        organisationId: payload.organisationId,
        customerId: payload.customerId,
        lineItems: (payload.lineItems ?? []) as Prisma.InputJsonValue,
        subtotal: payload.subtotal ?? 0,
        taxRate: payload.taxRate ?? 0,
        taxAmount: payload.taxAmount ?? 0,
        discountAmount: payload.discountAmount ?? 0,
        total: payload.total ?? 0,
        currency: payload.currency ?? req.tenant?.defaultCurrency ?? 'GBP',
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
        paymentTerms: payload.paymentTerms ?? 0,
        notes: payload.notes,
        status: 'DRAFT',
        createdBy: req.user?.sub
      }
    });

    if (idempotency.type === 'new') {
      await storeIdempotencyResult(req, idempotency.key, 201, invoice);
    }

    reply.status(201).send(invoice);
  });

  app.get('/api/v1/finance/invoices/:id', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const invoice = await app.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        payments: true,
        creditNotes: true,
        organisation: true,
        shipment: true
      }
    });

    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    reply.send(invoice);
  });

  app.patch('/api/v1/finance/invoices/:id', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const payload = req.body as {
      lineItems?: Array<Record<string, unknown>>;
      dueDate?: string;
      notes?: string;
      subtotal?: number;
      taxRate?: number;
      taxAmount?: number;
      discountAmount?: number;
      total?: number;
    };

    const invoice = await app.prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    if (invoice.status !== 'DRAFT') {
      return reply.status(400).send({ error: 'Only DRAFT invoices can be updated' });
    }

    const updated = await app.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        lineItems: payload.lineItems ? (payload.lineItems as Prisma.InputJsonValue) : undefined,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
        notes: payload.notes,
        subtotal: payload.subtotal,
        taxRate: payload.taxRate,
        taxAmount: payload.taxAmount,
        discountAmount: payload.discountAmount,
        total: payload.total
      }
    });

    reply.send(updated);
  });

  app.post('/api/v1/finance/invoices/:id/send', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const invoice = await app.prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    const updated = await app.prisma.$transaction(async (tx) => {
      const next = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'SENT', sentAt: new Date() }
      });

      await tx.notificationLog.create({
        data: {
          tenantId,
          channel: 'EMAIL',
          event: 'invoice_sent',
          status: 'QUEUED',
          userId: invoice.customerId ?? undefined
        }
      });

      return next;
    });

    reply.send(updated);
  });

  app.post('/api/v1/finance/invoices/:id/pay', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const payload = req.body as {
      amount?: number;
      currency?: string;
      method?: string;
      gatewayRef?: string;
    };

    if (!payload.amount || payload.amount <= 0) {
      return reply.status(400).send({ error: 'amount must be greater than zero' });
    }
    const paymentAmount = payload.amount;

    const invoice = await app.prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    const result = await app.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          shipmentId: invoice.shipmentId,
          customerId: invoice.customerId,
          amount: paymentAmount,
          currency: payload.currency ?? invoice.currency,
          method: payload.method,
          gatewayRef: payload.gatewayRef,
          status: PaymentStatus.COMPLETED
        }
      });

      const paidAggregate = await tx.payment.aggregate({
        where: { tenantId, invoiceId: invoice.id, status: PaymentStatus.COMPLETED },
        _sum: { amount: true }
      });
      const paidAmount = Number(paidAggregate._sum.amount ?? 0);
      const invoiceTotal = Number(invoice.total ?? 0);

      const nextStatus: InvoiceStatus = paidAmount >= invoiceTotal ? 'PAID' : 'PARTIALLY_PAID';
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: nextStatus,
          paidAt: nextStatus === 'PAID' ? new Date() : invoice.paidAt
        }
      });

      await tx.notificationLog.create({
        data: {
          tenantId,
          channel: 'EMAIL',
          event: 'payment_received',
          status: 'QUEUED',
          userId: invoice.customerId ?? undefined
        }
      });

      return { payment, invoice: updatedInvoice };
    });

    reply.send(result);
  });

  app.post('/api/v1/finance/invoices/:id/void', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const invoice = await app.prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    if (invoice.status === 'PAID') {
      return reply.status(400).send({ error: 'Cannot void PAID invoice' });
    }

    const updated = await app.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'VOID', voidedAt: new Date() }
    });
    reply.send(updated);
  });

  app.post('/api/v1/finance/invoices/bulk', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const payload = req.body as { dateFrom?: string; dateTo?: string };
    const dateFrom = payload.dateFrom ? new Date(payload.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = payload.dateTo ? new Date(payload.dateTo) : new Date();

    const shipments = await app.prisma.shipment.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        createdAt: { gte: dateFrom, lte: dateTo },
        invoice: null
      },
      orderBy: { createdAt: 'asc' }
    });

    const created: string[] = [];
    for (const shipment of shipments) {
      const invoiceNumber = await nextInvoiceNumber(app, tenantId, req.tenant?.slug ?? 'TENANT');
      const amount = Number(shipment.price ?? 0);
      const invoice = await app.prisma.invoice.create({
        data: {
          tenantId,
          invoiceNumber,
          shipmentId: shipment.id,
          customerId: shipment.customerId,
          organisationId: shipment.organisationId,
          lineItems: [{ description: `Shipment ${shipment.trackingNumber}`, amount }] as Prisma.InputJsonValue,
          subtotal: amount,
          taxRate: 0,
          taxAmount: 0,
          discountAmount: 0,
          total: amount,
          currency: shipment.currency,
          status: 'DRAFT',
          createdBy: req.user?.sub
        }
      });
      created.push(invoice.id);
    }

    reply.send({ createdCount: created.length, invoiceIds: created });
  });

  app.get('/api/v1/finance/payments', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const payments = await app.prisma.payment.findMany({
      where: { tenantId },
      include: { invoice: true },
      orderBy: { createdAt: 'desc' }
    });

    reply.send({ data: payments });
  });

  app.post('/api/v1/finance/credit-notes', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const payload = req.body as {
      invoiceId?: string;
      customerId?: string;
      organisationId?: string;
      amount?: number;
      currency?: string;
      reason?: string;
    };

    if (!payload.invoiceId || !payload.amount) {
      return reply.status(400).send({ error: 'invoiceId and amount are required' });
    }

    const invoice = await app.prisma.invoice.findFirst({ where: { id: payload.invoiceId, tenantId } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    const existingCount = await app.prisma.creditNote.count({ where: { tenantId } });
    const creditNumber = `${(req.tenant?.slug ?? 'TENANT').toUpperCase()}-CR-${yearPrefix()}-${String(existingCount + 1).padStart(4, '0')}`;

    const creditNote = await app.prisma.creditNote.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        customerId: payload.customerId ?? invoice.customerId,
        organisationId: payload.organisationId ?? invoice.organisationId,
        amount: payload.amount,
        currency: payload.currency ?? invoice.currency,
        reason: payload.reason,
        creditNumber
      }
    });

    reply.status(201).send(creditNote);
  });

  app.get('/api/v1/finance/credit-notes', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const creditNotes = await app.prisma.creditNote.findMany({
      where: { tenantId },
      include: { invoice: true, organisation: true },
      orderBy: { createdAt: 'desc' }
    });

    reply.send({ data: creditNotes });
  });

  app.get('/api/v1/finance/report/csv', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const query = req.query as { dateFrom?: string; dateTo?: string };
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();

    const invoices = await app.prisma.invoice.findMany({
      where: {
        tenantId,
        createdAt: { gte: dateFrom, lte: dateTo }
      },
      include: { organisation: true },
      orderBy: { createdAt: 'desc' }
    });

    const rows = invoices.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      customer: invoice.organisation?.name ?? '',
      status: invoice.status,
      total: Number(invoice.total),
      currency: invoice.currency,
      dueDate: invoice.dueDate?.toISOString() ?? '',
      sentAt: invoice.sentAt?.toISOString() ?? '',
      paidAt: invoice.paidAt?.toISOString() ?? ''
    }));

    reply
      .header('Content-Type', 'text/csv')
      .header(
        'Content-Disposition',
        `attachment; filename="fauward-finance-${dateFrom.toISOString().slice(0, 10)}-${dateTo
          .toISOString()
          .slice(0, 10)}.csv"`
      )
      .send(toCsv(rows));
  });

  app.get('/api/v1/finance/summary', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const invoices = await app.prisma.invoice.findMany({ where: { tenantId } });
    const totals = invoices.reduce(
      (acc, inv) => {
        const total = Number(inv.total ?? 0);
        acc.totalInvoiced += total;
        if (inv.status === 'PAID') acc.collected += total;
        if (inv.status === 'OVERDUE') acc.overdue += total;
        if (inv.status !== 'PAID') acc.outstanding += total;
        return acc;
      },
      { totalInvoiced: 0, collected: 0, outstanding: 0, overdue: 0 }
    );
    reply.send(totals);
  });
}
