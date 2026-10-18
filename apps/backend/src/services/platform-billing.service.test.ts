import Fastify, { type FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../modules/notifications/notifications.service.js', () => ({ sendEmail: sendEmailMock }));
const liftMock = vi.hoisted(() => vi.fn(async () => null));
vi.mock('./tenant-suspension.service.js', () => ({ liftDunningSuspensionForInvoice: liftMock }));

const { createPlatformInvoice, createPlatformCreditNote, recordManualPayment, voidPlatformInvoice, invoiceBalance } = await import('./platform-billing.service.js');

type Row = Record<string, unknown> & { id: string };
const actor = { type: 'STAFF' as const, platformUserId: 'pu_fin', email: 'finance@fauward.com', label: 'Finance' };

function world(tenantOverrides: Record<string, unknown> = {}) {
  let seq = 0;
  const tenant = { id: 't_1', name: 'Lagos Express', defaultCurrency: 'NGN', taxExempt: false, closedAt: null, ...tenantOverrides };
  const invoices: Row[] = [];
  const payments: Row[] = [];
  const credits: Row[] = [];
  const inApp: Row[] = [];
  const prisma = {
    tenant: { findUnique: vi.fn(async () => tenant) },
    invoice: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: `inv_${(seq += 1)}`, createdAt: new Date(), voidedAt: null, stripeInvoiceId: null, ...data };
        invoices.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string; kind: string } }) => {
        const row = invoices.find((invoice) => invoice.id === where.id && invoice.kind === where.kind);
        return row ? { ...row, tenant: { id: tenant.id, name: tenant.name }, payments: payments.filter((p) => p.invoiceId === row.id && p.kind === where.kind), creditNotes: credits.filter((c) => c.invoiceId === row.id && c.kind === where.kind) } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(invoices.find((row) => row.id === where.id)!, data))
    },
    payment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: `pay_${(seq += 1)}`, refundedAmount: new Prisma.Decimal(0), ...data };
        payments.push(row);
        return row;
      })
    },
    creditNote: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: `cn_${(seq += 1)}`, createdAt: new Date(), ...data };
        credits.push(row);
        return row;
      })
    },
    user: { findMany: vi.fn(async () => [{ id: 'u_admin', email: 'owner@lagos.test' }]) },
    inAppNotification: { createMany: vi.fn(async ({ data }: { data: Row[] }) => inApp.push(...data)) },
    platformActivity: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'act', ...create })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma))
  };
  const app = { prisma, redis: { publish: vi.fn(async () => 1) }, log: { error: vi.fn(), warn: vi.fn() } };
  return { app: app as never, prisma, invoices, payments, credits, inApp };
}

beforeEach(() => {
  sendEmailMock.mockClear();
  liftMock.mockClear();
});

describe('PLATFORM billing (revenue.billing, D4)', () => {
  it('ACC-BIL-7 ACC-BIL-10 a sent manual invoice is PLATFORM, in the tenant currency, and tenant admins are notified', async () => {
    const w = world();
    const invoice = await createPlatformInvoice(w.app, { tenantId: 't_1', lineItems: [{ description: 'Pro plan, October', quantity: 1, unitAmount: '45000.50' }], taxRate: '7.5', send: true }, actor);
    expect(invoice).toMatchObject({ kind: 'PLATFORM', currency: 'NGN', status: 'SENT' });
    expect((invoice.total as Prisma.Decimal).toFixed(2)).toBe('48375.54');
    expect(w.inApp).toEqual([expect.objectContaining({ tenantId: 't_1', userId: 'u_admin', type: 'billing.invoice_from_fauward' })]);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ template: 'invoice_sent', data: expect.objectContaining({ currency: 'NGN' }) }));
  });

  it('a tax-exempt tenant is invoiced with no tax; a draft notifies nobody', async () => {
    const w = world({ taxExempt: true });
    const invoice = await createPlatformInvoice(w.app, { tenantId: 't_1', lineItems: [{ description: 'Setup', quantity: 2, unitAmount: '100' }], taxRate: '20' }, actor);
    expect((invoice.taxAmount as Prisma.Decimal).toFixed(2)).toBe('0.00');
    expect((invoice.total as Prisma.Decimal).toFixed(2)).toBe('200.00');
    expect(w.inApp).toEqual([]);
  });

  it('ACC-BIL-8 a credit note cannot exceed the outstanding balance', async () => {
    const w = world({ defaultCurrency: 'GBP' });
    const invoice = await createPlatformInvoice(w.app, { tenantId: 't_1', lineItems: [{ description: 'Pro plan', quantity: 1, unitAmount: '79.00' }] }, actor);
    await recordManualPayment(w.app, { invoiceId: invoice.id, amount: '50.00', method: 'BANK_TRANSFER', reason: 'Bank transfer received' }, actor);
    await expect(createPlatformCreditNote(w.app, { invoiceId: invoice.id, amount: '29.01', reason: 'Goodwill credit' }, actor)).rejects.toMatchObject({ code: 'CREDIT_EXCEEDS_BALANCE', statusCode: 409, extra: { outstanding: '29.00', currency: 'GBP' } });
    const credit = await createPlatformCreditNote(w.app, { invoiceId: invoice.id, amount: '29.00', reason: 'Goodwill credit' }, actor);
    expect(credit).toMatchObject({ kind: 'PLATFORM', currency: 'GBP' });
    expect(w.invoices[0].status).toBe('PAID');
  });

  it('ACC-BIL-9 void is blocked once a payment exists', async () => {
    const w = world({ defaultCurrency: 'GBP' });
    const unpaid = await createPlatformInvoice(w.app, { tenantId: 't_1', lineItems: [{ description: 'Pro plan', quantity: 1, unitAmount: '79.00' }] }, actor);
    expect((await voidPlatformInvoice(w.app, unpaid.id, 'Issued by mistake', actor)).status).toBe('VOID');
    const paid = await createPlatformInvoice(w.app, { tenantId: 't_1', lineItems: [{ description: 'Pro plan', quantity: 1, unitAmount: '79.00' }] }, actor);
    await recordManualPayment(w.app, { invoiceId: paid.id, amount: '10.00', method: 'BANK_TRANSFER', reason: 'Part payment' }, actor);
    await expect(voidPlatformInvoice(w.app, paid.id, 'Issued by mistake', actor)).rejects.toMatchObject({ code: 'PAYMENTS_EXIST', statusCode: 409 });
  });

  it('a manual payment that settles the invoice marks it PAID and lifts the DUNNING suspension for it; overpayment is refused', async () => {
    const w = world({ defaultCurrency: 'GBP' });
    const invoice = await createPlatformInvoice(w.app, { tenantId: 't_1', lineItems: [{ description: 'Pro plan', quantity: 1, unitAmount: '79.00' }] }, actor);
    await expect(recordManualPayment(w.app, { invoiceId: invoice.id, amount: '80.00', method: 'BANK_TRANSFER', reason: 'Bank transfer received' }, actor)).rejects.toMatchObject({ code: 'OVERPAYMENT' });
    const result = await recordManualPayment(w.app, { invoiceId: invoice.id, amount: '79.00', method: 'BANK_TRANSFER', reason: 'Bank transfer received' }, actor);
    expect(result.invoiceStatus).toBe('PAID');
    expect(w.payments[0]).toMatchObject({ kind: 'PLATFORM', currency: 'GBP', status: 'COMPLETED' });
    expect(liftMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 't_1', invoiceRef: invoice.id }));
  });

  it('invoiceBalance nets refunds and credits and never goes below zero', () => {
    const balance = invoiceBalance({
      total: '100.00',
      payments: [
        { amount: '60.00', refundedAmount: '10.00', status: 'COMPLETED' },
        { amount: '40.00', refundedAmount: '0', status: 'FAILED' }
      ],
      creditNotes: [{ amount: '30.00' }]
    });
    expect([balance.paid.toFixed(2), balance.credited.toFixed(2), balance.outstanding.toFixed(2)]).toEqual(['50.00', '30.00', '20.00']);
  });
});

describe('ledger separation on the read side (ACC-BIL-6)', () => {
  const openApps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(openApps.splice(0).map((app) => app.close()));
  });

  it("ACC-BIL-6 the tenant's 'Invoices from Fauward' reads only its own PLATFORM rows", async () => {
    vi.doMock('../shared/middleware/authenticate.js', () => ({
      authenticate: async (request: { user?: unknown }) => {
        request.user = { sub: 'u_admin', tenantId: 't_1', role: 'TENANT_ADMIN' };
      }
    }));
    const findMany = vi.fn(async () => []);
    const app = Fastify();
    openApps.push(app);
    app.decorate('prisma', { invoice: { findMany }, refund: { findMany: vi.fn(async () => []) } } as never);
    const { registerTenantPlatformInvoiceRoutes } = await import('../modules/tenants/platform-invoices.routes.js');
    await registerTenantPlatformInvoiceRoutes(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/billing/invoices' });
    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't_1', kind: 'PLATFORM', status: { not: 'DRAFT' } } }));
    vi.doUnmock('../shared/middleware/authenticate.js');
  });
});
