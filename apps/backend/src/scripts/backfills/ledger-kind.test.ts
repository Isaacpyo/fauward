import { describe, expect, it, vi } from 'vitest';
import { backfillLedgerKind } from './ledger-kind.js';

function world() {
  const audit = [
    { action: 'invoice.create', targetType: 'invoice', targetId: 'inv_console' },
    { action: 'credit_note.create', targetType: 'credit_note', targetId: 'cn_console' },
    { action: 'refund.request', targetType: 'refund', targetId: 'ref_customer' }
  ];
  const invoices = [{ id: 'inv_console', kind: 'TENANT_CUSTOMER' }, { id: 'inv_tenant', kind: 'TENANT_CUSTOMER' }];
  const payments = [{ id: 'pay_console', invoiceId: 'inv_console', kind: 'TENANT_CUSTOMER' }, { id: 'pay_customer', invoiceId: 'inv_tenant', kind: 'TENANT_CUSTOMER' }];
  const refunds = [{ id: 'ref_customer', paymentId: 'pay_customer', kind: 'TENANT_CUSTOMER' }, { id: 'ref_console', paymentId: 'pay_console', kind: 'TENANT_CUSTOMER' }];
  const credits = [{ id: 'cn_console', invoiceId: 'inv_console', kind: 'TENANT_CUSTOMER' }, { id: 'cn_tenant', invoiceId: 'inv_tenant', kind: 'TENANT_CUSTOMER' }];
  type Row = { id: string; kind: string; invoiceId?: string; paymentId?: string };
  const pick = (rows: Row[], where: { id?: { in: string[] }; invoiceId?: { in: string[] }; paymentId?: { in: string[] }; OR?: Array<{ id?: { in: string[] }; invoiceId?: { in: string[] } }>; kind?: string | { in: string[] } }) =>
    rows.filter((row) => {
      if (where.id && !where.id.in.includes(row.id)) return false;
      if (where.invoiceId && !where.invoiceId.in.includes(row.invoiceId ?? '')) return false;
      if (where.paymentId && !where.paymentId.in.includes(row.paymentId ?? '')) return false;
      if (where.OR && !where.OR.some((clause) => (clause.id ? clause.id.in.includes(row.id) : false) || (clause.invoiceId ? clause.invoiceId.in.includes(row.invoiceId ?? '') : false))) return false;
      if (typeof where.kind === 'string' && row.kind !== where.kind) return false;
      return true;
    });
  const model = (rows: Row[]) => ({
    findMany: vi.fn(async ({ where }: { where: Parameters<typeof pick>[1] }) => pick(rows, where)),
    count: vi.fn(async ({ where }: { where: Parameters<typeof pick>[1] }) => pick(rows, where).length),
    updateMany: vi.fn(async ({ where, data }: { where: Parameters<typeof pick>[1]; data: { kind: string } }) => {
      const hit = pick(rows, where);
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    })
  });
  const prisma = {
    platformAuditLog: { findMany: vi.fn(async ({ where }: { where: { action: { in: string[] }; targetType: string } }) => audit.filter((row) => where.action.in.includes(row.action) && row.targetType === where.targetType)) },
    invoice: model(invoices),
    payment: model(payments),
    refund: model(refunds),
    creditNote: model(credits),
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  };
  return { prisma, invoices, payments, refunds, credits };
}

describe('0045 ledger-kind backfill (D4)', () => {
  it('dry-run counts PLATFORM rows found through console audit entries and writes nothing', async () => {
    const w = world();
    const result = await backfillLedgerKind(w.prisma as never, { dryRun: true });
    expect(result).toMatchObject({ invoices: { platform: 1, tenantCustomer: 1 }, payments: { platform: 1, tenantCustomer: 1 }, creditNotes: { platform: 1, tenantCustomer: 1 }, refunds: { platform: 1, tenantCustomer: 1 }, auditedRefundsLeftOnTheirPaymentLedger: 1 });
    expect(w.invoices.every((row) => row.kind === 'TENANT_CUSTOMER')).toBe(true);
  });

  it("tags console rows PLATFORM; a console refund of a tenant's customer payment stays on that payment's ledger (C45)", async () => {
    const w = world();
    await backfillLedgerKind(w.prisma as never, { dryRun: false });
    expect(Object.fromEntries(w.invoices.map((row) => [row.id, row.kind]))).toEqual({ inv_console: 'PLATFORM', inv_tenant: 'TENANT_CUSTOMER' });
    expect(Object.fromEntries(w.payments.map((row) => [row.id, row.kind]))).toEqual({ pay_console: 'PLATFORM', pay_customer: 'TENANT_CUSTOMER' });
    expect(Object.fromEntries(w.refunds.map((row) => [row.id, row.kind]))).toEqual({ ref_customer: 'TENANT_CUSTOMER', ref_console: 'PLATFORM' });
    expect(Object.fromEntries(w.credits.map((row) => [row.id, row.kind]))).toEqual({ cn_console: 'PLATFORM', cn_tenant: 'TENANT_CUSTOMER' });
  });
});
