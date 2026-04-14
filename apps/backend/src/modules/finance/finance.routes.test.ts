import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/middleware/authenticate.js', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = req.user ?? { sub: 'user-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
  })
}));
vi.mock('../../shared/middleware/featureGuard.js', () => ({
  requireFeature: vi.fn(() => async () => {})
}));
vi.mock('../../shared/middleware/requireRole.js', () => ({
  requireRole: vi.fn(() => async () => {})
}));
vi.mock('../../shared/middleware/idempotency.js', () => ({
  resolveIdempotency: vi.fn(async () => ({ type: 'bypass' })),
  storeIdempotencyResult: vi.fn(async () => {})
}));

import { registerFinanceRoutes, runOverdueInvoiceSweep } from './finance.routes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_INVOICE = {
  id: 'inv-1', tenantId: 'tenant-1', invoiceNumber: 'ACME-INV-2026-0001',
  status: 'DRAFT', total: 150, currency: 'GBP', lineItems: [],
  payments: [], creditNotes: [], organisation: null, shipment: null
};

const SENT_INVOICE = { ...DRAFT_INVOICE, status: 'SENT', sentAt: new Date() };
const PAID_INVOICE = { ...DRAFT_INVOICE, status: 'PAID', paidAt: new Date() };

// ─────────────────────────────────────────────────────────────────────────────
// App builder
// ─────────────────────────────────────────────────────────────────────────────

function buildApp(invoiceOverride: any = DRAFT_INVOICE) {
  const app = Fastify();
  const prisma = {
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(invoiceOverride),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'inv-new', ...data })),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...DRAFT_INVOICE, ...data })),
      count: vi.fn().mockResolvedValue(0)
    },
    payment: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'pay-1', ...data }))
    },
    notificationLog: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    idempotencyKey: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({})
    },
    $transaction: vi.fn(async (ops: any) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return ops(prisma);
      return ops;
    })
  };

  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', async (req: any) => {
    req.user = { sub: 'user-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
  });
  app.addHook('onRequest', (req, _reply, done) => {
    (req as any).tenant = { id: 'tenant-1', slug: 'acme', plan: 'PRO', defaultCurrency: 'GBP' };
    done();
  });

  return { app, prisma };
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  while (apps.length) {
    const ctx = apps.pop();
    if (ctx) await ctx.app.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/finance/invoices
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/finance/invoices', () => {
  it('creates invoice with DRAFT status and correct invoice number format', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerFinanceRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/finance/invoices',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: 150, currency: 'GBP' })
    });

    expect(res.statusCode).toBe(201);
    const created = ctx.prisma.invoice.create.mock.calls[0][0].data;
    expect(created.status).toBe('DRAFT');
    expect(created.tenantId).toBe('tenant-1');
    expect(created.invoiceNumber).toMatch(/^ACME-INV-\d{4}-\d{4}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/finance/invoices/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/finance/invoices/:id', () => {
  it('allows update on a DRAFT invoice', async () => {
    const ctx = buildApp(DRAFT_INVOICE);
    apps.push(ctx);
    await registerFinanceRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/finance/invoices/inv-1',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Updated note', total: 200 })
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.invoice.update).toHaveBeenCalledTimes(1);
  });

  it('rejects update on a non-DRAFT invoice with 400', async () => {
    const ctx = buildApp(SENT_INVOICE);
    apps.push(ctx);
    await registerFinanceRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/finance/invoices/inv-1',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Try to update' })
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/DRAFT/i);
    expect(ctx.prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('returns 404 for an invoice belonging to another tenant', async () => {
    const ctx = buildApp(null); // findFirst returns null = cross-tenant or not found
    apps.push(ctx);
    await registerFinanceRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/finance/invoices/inv-other',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Attempt' })
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/finance/invoices/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/finance/invoices/:id', () => {
  it('returns the invoice with payments and creditNotes included', async () => {
    const ctx = buildApp({ ...DRAFT_INVOICE, payments: [{ id: 'pay-1' }], creditNotes: [] });
    apps.push(ctx);
    await registerFinanceRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/finance/invoices/inv-1',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'inv-1', tenantId: 'tenant-1' })
      })
    );
  });

  it('returns 404 for unknown invoice ID', async () => {
    const ctx = buildApp(null);
    apps.push(ctx);
    await registerFinanceRoutes(ctx.app as any);

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/finance/invoices/does-not-exist',
      headers: { Authorization: 'Bearer token' }
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runOverdueInvoiceSweep
// ─────────────────────────────────────────────────────────────────────────────

describe('runOverdueInvoiceSweep', () => {
  it('marks SENT invoices past their due date as OVERDUE', async () => {
    const overdueInvoice = { id: 'inv-overdue', tenantId: 'tenant-1', status: 'SENT', dueDate: new Date('2026-01-01') };
    const prisma = {
      invoice: {
        findMany: vi.fn().mockResolvedValue([overdueInvoice]),
        update: vi.fn().mockResolvedValue({ ...overdueInvoice, status: 'OVERDUE' })
      },
      notificationLog: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(async (ops: any[]) => Promise.all(ops))
    };
    const app = { prisma } as any;

    const count = await runOverdueInvoiceSweep(app);

    expect(count).toBe(1);
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inv-overdue' }, data: { status: 'OVERDUE' } })
    );
    expect(prisma.notificationLog.createMany).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when no invoices are overdue', async () => {
    const prisma = {
      invoice: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn()
    };
    const app = { prisma } as any;

    const count = await runOverdueInvoiceSweep(app);

    expect(count).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
