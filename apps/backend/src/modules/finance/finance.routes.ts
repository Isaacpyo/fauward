import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { InvoiceStatus, PaymentStatus, Prisma, ReturnStatus } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { resolveIdempotency, storeIdempotencyResult } from '../../shared/middleware/idempotency.js';
import { planService } from '../tenants/plan.service.js';

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

    const query = req.query as {
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      customerId?: string;
      organisationId?: string;
      minTotal?: string;
      maxTotal?: string;
      page?: string;
      limit?: string;
    };

    const hasAnyFilter = Boolean(
      query.status || query.dateFrom || query.dateTo || query.customerId || query.organisationId ||
      query.minTotal || query.maxTotal || query.page || query.limit
    );

    if (!hasAnyFilter) {
      const invoices = await app.prisma.invoice.findMany({
        where: { tenantId },
        include: { organisation: true },
        orderBy: { createdAt: 'desc' }
      });
      return reply.send({ data: invoices });
    }

    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const statuses = typeof query.status === 'string'
      ? query.status.split(',').map((v) => v.trim()).filter(Boolean)
      : [];

    const totalFilter: Prisma.DecimalFilter = {};
    if (query.minTotal !== undefined) totalFilter.gte = new Prisma.Decimal(query.minTotal);
    if (query.maxTotal !== undefined) totalFilter.lte = new Prisma.Decimal(query.maxTotal);

    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (query.dateFrom) createdAtFilter.gte = new Date(query.dateFrom);
    if (query.dateTo) createdAtFilter.lte = new Date(query.dateTo);

    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      status: statuses.length > 0 ? { in: statuses as InvoiceStatus[] } : undefined,
      customerId: query.customerId || undefined,
      organisationId: query.organisationId || undefined,
      total: Object.keys(totalFilter).length > 0 ? totalFilter : undefined,
      createdAt: Object.keys(createdAtFilter).length > 0 ? createdAtFilter : undefined
    };

    const [rows, total] = await Promise.all([
      app.prisma.invoice.findMany({
        where,
        include: { organisation: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      app.prisma.invoice.count({ where })
    ]);

    reply.send({
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
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

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: req.user?.sub,
          action: 'INVOICE_SENT',
          resourceType: 'INVOICE',
          resourceId: invoice.id,
          metadata: { invoiceNumber: invoice.invoiceNumber } as Prisma.InputJsonValue
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

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: req.user?.sub,
          action: nextStatus === 'PAID' ? 'INVOICE_MARKED_PAID' : 'INVOICE_PARTIALLY_PAID',
          resourceType: 'INVOICE',
          resourceId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            paymentId: payment.id,
            amount: Number(paymentAmount),
            currency: payment.currency,
            method: payment.method ?? null
          } as Prisma.InputJsonValue
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

    const updated = await app.prisma.$transaction(async (tx) => {
      const next = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'VOID', voidedAt: new Date() }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: req.user?.sub,
          action: 'INVOICE_VOIDED',
          resourceType: 'INVOICE',
          resourceId: invoice.id,
          metadata: { invoiceNumber: invoice.invoiceNumber } as Prisma.InputJsonValue
        }
      });
      return next;
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
    const creditAmount = payload.amount;

    const invoice = await app.prisma.invoice.findFirst({ where: { id: payload.invoiceId, tenantId } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    const existingCount = await app.prisma.creditNote.count({ where: { tenantId } });
    const creditNumber = `${(req.tenant?.slug ?? 'TENANT').toUpperCase()}-CR-${yearPrefix()}-${String(existingCount + 1).padStart(4, '0')}`;

    const creditNote = await app.prisma.$transaction(async (tx) => {
      const created = await tx.creditNote.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          customerId: payload.customerId ?? invoice.customerId,
          organisationId: payload.organisationId ?? invoice.organisationId,
          amount: creditAmount,
          currency: payload.currency ?? invoice.currency,
          reason: payload.reason,
          creditNumber
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: req.user?.sub,
          action: 'CREDIT_NOTE_CREATED',
          resourceType: 'CREDIT_NOTE',
          resourceId: created.id,
          metadata: {
            creditNumber: created.creditNumber,
            invoiceId: invoice.id,
            amount: Number(created.amount),
            currency: created.currency
          } as Prisma.InputJsonValue
        }
      });
      return created;
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
        if (inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID' || inv.status === 'OVERDUE') {
          acc.outstanding += total;
        }
        return acc;
      },
      { totalInvoiced: 0, collected: 0, outstanding: 0, overdue: 0 }
    );

    const codAgg = await app.prisma.payment.groupBy({
      by: ['status'],
      where: { tenantId, method: 'CASH' },
      _sum: { amount: true }
    });
    let codOutstanding = 0;
    let codCollected = 0;
    for (const row of codAgg) {
      const sum = Number(row._sum.amount ?? 0);
      if (row.status === PaymentStatus.COMPLETED) codCollected += sum;
      else codOutstanding += sum;
    }

    let payoutsMatchedPct: number | null = null;
    let payoutsUnmatchedCount: number | null = null;
    if (planService.hasFeature(req.tenant?.plan ?? 'STARTER', 'financeSettlementsReconciliation')) {
      const [matched, unmatched] = await Promise.all([
        app.prisma.gatewayPayoutLine.count({ where: { tenantId, matchedPaymentId: { not: null } } }),
        app.prisma.gatewayPayoutLine.count({ where: { tenantId, matchedPaymentId: null } })
      ]);
      const total = matched + unmatched;
      payoutsMatchedPct = total > 0 ? Math.round((matched / total) * 1000) / 10 : null;
      payoutsUnmatchedCount = unmatched;
    }

    reply.send({
      ...totals,
      codOutstanding,
      codCollected,
      payoutsMatchedPct,
      payoutsUnmatchedCount
    });
  });

  // --- Phase 2 backfill: shipments missing payment row ---
  app.get('/api/v1/finance/admin/shipments-missing-payment', { preHandler: [authenticate, requireFeature('financeModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const query = req.query as { dateFrom?: string; dateTo?: string; page?: string; limit?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
    const skip = (page - 1) * limit;
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    const where: Prisma.ShipmentWhereInput = {
      tenantId,
      payment: { is: null },
      createdAt: dateFrom || dateTo ? { gte: dateFrom, lte: dateTo } : undefined
    };

    const [rows, total] = await Promise.all([
      app.prisma.shipment.findMany({
        where,
        select: {
          id: true,
          trackingNumber: true,
          status: true,
          price: true,
          currency: true,
          createdAt: true,
          customerId: true,
          organisationId: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      app.prisma.shipment.count({ where })
    ]);

    reply.send({
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  });

  // --- Phase 4 Returns ---
  app.get('/api/v1/finance/returns', { preHandler: [authenticate, requireFeature('financeReturns')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const query = req.query as { status?: string; dateFrom?: string; dateTo?: string; page?: string; limit?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;
    const statuses = typeof query.status === 'string'
      ? query.status.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const createdAt: { gte?: Date; lte?: Date } = {};
    if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) createdAt.lte = new Date(query.dateTo);

    const where: Prisma.ReturnRequestWhereInput = {
      tenantId,
      status: statuses.length > 0 ? { in: statuses as ReturnStatus[] } : undefined,
      createdAt: Object.keys(createdAt).length > 0 ? createdAt : undefined
    };

    const [rows, total] = await Promise.all([
      app.prisma.returnRequest.findMany({
        where,
        include: {
          shipment: {
            select: {
              id: true, trackingNumber: true, currency: true,
              payment: { select: { id: true, refunds: true } },
              invoice: { select: { id: true, invoiceNumber: true, creditNotes: true } }
            }
          },
          customer: { select: { id: true, email: true } },
          organisation: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      app.prisma.returnRequest.count({ where })
    ]);

    const data = rows.map((r) => {
      const items = Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : [];
      const itemsCount = items.length;
      const itemsValue = items.reduce((sum, it) => sum + Number((it as { value?: number; declaredValue?: number }).value ?? (it as { declaredValue?: number }).declaredValue ?? 0), 0);
      const refunds = r.shipment?.payment?.refunds ?? [];
      const credits = r.shipment?.invoice?.creditNotes ?? [];
      const refundedTotal = refunds.reduce((sum, rf) => sum + Number(rf.amount ?? 0), 0);
      const creditedTotal = credits.reduce((sum, cn) => sum + Number(cn.amount ?? 0), 0);
      return {
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        shipmentId: r.shipmentId,
        trackingNumber: r.shipment?.trackingNumber ?? null,
        customer: r.customer?.email ?? null,
        organisation: r.organisation?.name ?? null,
        itemsCount,
        itemsValue,
        currency: r.shipment?.currency ?? null,
        returnFee: r.returnFee ? Number(r.returnFee) : 0,
        feeCurrency: r.feeCurrency,
        paymentStatus: r.paymentStatus,
        refundedTotal,
        creditedTotal,
        invoiceNumber: r.shipment?.invoice?.invoiceNumber ?? null
      };
    });

    reply.send({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  // --- Phase 5b COD & Collections ---
  app.get('/api/v1/finance/collections', { preHandler: [authenticate, requireFeature('financeCod')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const codPayments = await app.prisma.payment.findMany({
      where: { tenantId, method: 'CASH' },
      include: {
        shipment: {
          select: { id: true, trackingNumber: true, assignedDriverId: true }
        }
      }
    });

    let outstandingCount = 0;
    let outstandingValue = 0;
    let collectedCount = 0;
    let collectedValue = 0;
    const byDriverMap = new Map<string, { driverId: string; outstandingValue: number; collectedValue: number }>();
    const outstandingList: Array<{ shipmentId: string; trackingNumber: string | null; amount: number; currency: string; assignedDriverId: string | null }> = [];

    for (const p of codPayments) {
      const amount = Number(p.amount ?? 0);
      const driverId = p.shipment?.assignedDriverId ?? null;
      const isCompleted = p.status === PaymentStatus.COMPLETED;
      if (isCompleted) {
        collectedCount += 1;
        collectedValue += amount;
      } else {
        outstandingCount += 1;
        outstandingValue += amount;
        outstandingList.push({
          shipmentId: p.shipment?.id ?? p.shipmentId ?? '',
          trackingNumber: p.shipment?.trackingNumber ?? null,
          amount,
          currency: p.currency,
          assignedDriverId: driverId
        });
      }
      if (driverId) {
        const cur = byDriverMap.get(driverId) ?? { driverId, outstandingValue: 0, collectedValue: 0 };
        if (isCompleted) cur.collectedValue += amount;
        else cur.outstandingValue += amount;
        byDriverMap.set(driverId, cur);
      }
    }

    const driverIds = [...byDriverMap.keys()];
    const drivers = driverIds.length > 0
      ? await app.prisma.driver.findMany({
          where: { tenantId, id: { in: driverIds } },
          include: { user: { select: { email: true } } }
        })
      : [];
    const driverNameById = new Map(drivers.map((d) => [d.id, d.user?.email ?? d.id]));
    const byDriver = [...byDriverMap.values()].map((row) => ({
      ...row,
      name: driverNameById.get(row.driverId) ?? row.driverId
    }));

    reply.send({
      outstandingCount,
      outstandingValue,
      collectedCount,
      collectedValue,
      byDriver,
      outstandingList
    });
  });

  // --- Phase 5 GatewayPayout reads + manual match ---
  app.get('/api/v1/finance/payouts', { preHandler: [authenticate, requireFeature('financeSettlementsReconciliation')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const query = req.query as { dateFrom?: string; dateTo?: string; status?: string; page?: string; limit?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;
    const arrival: { gte?: Date; lte?: Date } = {};
    if (query.dateFrom) arrival.gte = new Date(query.dateFrom);
    if (query.dateTo) arrival.lte = new Date(query.dateTo);

    const where: Prisma.GatewayPayoutWhereInput = {
      tenantId,
      status: query.status || undefined,
      arrivalDate: Object.keys(arrival).length > 0 ? arrival : undefined
    };

    const [rows, total] = await Promise.all([
      app.prisma.gatewayPayout.findMany({
        where,
        orderBy: { arrivalDate: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { lines: true } } }
      }),
      app.prisma.gatewayPayout.count({ where })
    ]);

    reply.send({ data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  app.get('/api/v1/finance/payouts/unmatched', { preHandler: [authenticate, requireFeature('financeSettlementsReconciliation')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const lines = await app.prisma.gatewayPayoutLine.findMany({
      where: { tenantId, matchedPaymentId: null },
      include: { payout: { select: { providerPayoutId: true, arrivalDate: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    reply.send({ data: lines });
  });

  app.get('/api/v1/finance/payouts/:id', { preHandler: [authenticate, requireFeature('financeSettlementsReconciliation')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const payout = await app.prisma.gatewayPayout.findFirst({
      where: { id, tenantId },
      include: { lines: { include: { matchedPayment: true } } }
    });
    if (!payout) return reply.status(404).send({ error: 'Payout not found' });

    const matched = payout.lines.filter((l) => l.matchedPaymentId).length;
    const unmatched = payout.lines.length - matched;
    reply.send({ ...payout, matchedLines: matched, unmatchedLines: unmatched });
  });

  app.post('/api/v1/finance/payouts/:lineId/manual-match', { preHandler: [authenticate, requireFeature('financeSettlementsReconciliation')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { lineId } = req.params as { lineId: string };
    const body = req.body as { paymentId?: string };
    if (!body.paymentId) return reply.status(400).send({ error: 'paymentId is required' });

    const [line, payment] = await Promise.all([
      app.prisma.gatewayPayoutLine.findFirst({ where: { id: lineId, tenantId } }),
      app.prisma.payment.findFirst({ where: { id: body.paymentId, tenantId } })
    ]);
    if (!line) return reply.status(404).send({ error: 'Payout line not found' });
    if (!payment) return reply.status(404).send({ error: 'Payment not found' });

    const updated = await app.prisma.$transaction(async (tx) => {
      const next = await tx.gatewayPayoutLine.update({
        where: { id: line.id },
        data: { matchedPaymentId: payment.id }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: req.user?.sub,
          action: 'PAYOUT_LINE_MATCHED_MANUAL',
          resourceType: 'GATEWAY_PAYOUT_LINE',
          resourceId: line.id,
          metadata: {
            paymentId: payment.id,
            providerTxnId: line.providerTxnId
          } as Prisma.InputJsonValue
        }
      });
      return next;
    });

    reply.send(updated);
  });
}
