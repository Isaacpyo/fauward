import type { PrismaClient } from '@prisma/client';

export type LedgerKindBackfillResult = {
  dryRun: boolean;
  invoices: { platform: number; tenantCustomer: number };
  creditNotes: { platform: number; tenantCustomer: number };
  payments: { platform: number; tenantCustomer: number };
  refunds: { platform: number; tenantCustomer: number };
  auditedRefundsLeftOnTheirPaymentLedger: number;
};

const INVOICE_ACTIONS = ['invoice.create'];
const CREDIT_ACTIONS = ['credit_note.create'];
const REFUND_ACTIONS = ['invoice.refund', 'refund.request'];

async function auditedTargets(prisma: PrismaClient, actions: string[], targetType: string) {
  const rows = await prisma.platformAuditLog.findMany({ where: { action: { in: actions }, targetType, targetId: { not: null } }, select: { targetId: true } });
  return [...new Set(rows.map((row) => row.targetId).filter((id): id is string => Boolean(id)))];
}

/**
 * Backfill for migration 0045_ledger_kind (D4): rows the console billing routes created — found through their
 * PlatformAuditLog entries — become PLATFORM, and so do payments of PLATFORM invoices. A refund follows its payment's
 * ledger (C45): console refunds before WP-1.5 refunded tenants' customer payments and stay TENANT_CUSTOMER.
 * Idempotent; `dryRun` only counts.
 */
export async function backfillLedgerKind(prisma: PrismaClient, options: { dryRun: boolean }): Promise<LedgerKindBackfillResult> {
  const [invoiceIds, creditIds, refundIds] = await Promise.all([
    auditedTargets(prisma, INVOICE_ACTIONS, 'invoice'),
    auditedTargets(prisma, CREDIT_ACTIONS, 'credit_note'),
    auditedTargets(prisma, REFUND_ACTIONS, 'refund')
  ]);
  const platformInvoices = await prisma.invoice.findMany({ where: { id: { in: invoiceIds }, kind: { in: ['PLATFORM', 'TENANT_CUSTOMER'] } }, select: { id: true } });
  const invoiceIdSet = platformInvoices.map((row) => row.id);
  const platformPayments = await prisma.payment.findMany({ where: { invoiceId: { in: invoiceIdSet }, kind: { in: ['PLATFORM', 'TENANT_CUSTOMER'] } }, select: { id: true } });
  const paymentIdSet = platformPayments.map((row) => row.id);
  const auditedRefunds = await prisma.refund.findMany({ where: { id: { in: refundIds }, kind: { in: ['PLATFORM', 'TENANT_CUSTOMER'] } }, select: { id: true, paymentId: true } });
  const platformRefundIds = auditedRefunds.filter((refund) => paymentIdSet.includes(refund.paymentId)).map((refund) => refund.id);
  const refundsOfPlatformPayments = await prisma.refund.findMany({ where: { paymentId: { in: paymentIdSet }, kind: { in: ['PLATFORM', 'TENANT_CUSTOMER'] } }, select: { id: true } });
  const refundIdSet = [...new Set([...platformRefundIds, ...refundsOfPlatformPayments.map((row) => row.id)])];

  if (!options.dryRun) {
    await prisma.$transaction([
      prisma.invoice.updateMany({ where: { id: { in: invoiceIdSet }, kind: 'TENANT_CUSTOMER' }, data: { kind: 'PLATFORM' } }),
      prisma.creditNote.updateMany({ where: { OR: [{ id: { in: creditIds } }, { invoiceId: { in: invoiceIdSet } }], kind: 'TENANT_CUSTOMER' }, data: { kind: 'PLATFORM' } }),
      prisma.payment.updateMany({ where: { id: { in: paymentIdSet }, kind: 'TENANT_CUSTOMER' }, data: { kind: 'PLATFORM' } }),
      prisma.refund.updateMany({ where: { id: { in: refundIdSet }, kind: 'TENANT_CUSTOMER' }, data: { kind: 'PLATFORM' } })
    ]);
  }

  const bothKinds = ['PLATFORM' as const, 'TENANT_CUSTOMER' as const];
  const [invoiceTotal, paymentTotal, refundTotal, creditTotal, creditPlatform] = await Promise.all([
    prisma.invoice.count({ where: { kind: { in: bothKinds } } }),
    prisma.payment.count({ where: { kind: { in: bothKinds } } }),
    prisma.refund.count({ where: { kind: { in: bothKinds } } }),
    prisma.creditNote.count({ where: { kind: { in: bothKinds } } }),
    prisma.creditNote.count({ where: { kind: { in: bothKinds }, OR: [{ id: { in: creditIds } }, { invoiceId: { in: invoiceIdSet } }] } })
  ]);
  return {
    dryRun: options.dryRun,
    invoices: { platform: invoiceIdSet.length, tenantCustomer: invoiceTotal - invoiceIdSet.length },
    creditNotes: { platform: creditPlatform, tenantCustomer: creditTotal - creditPlatform },
    payments: { platform: paymentIdSet.length, tenantCustomer: paymentTotal - paymentIdSet.length },
    refunds: { platform: refundIdSet.length, tenantCustomer: refundTotal - refundIdSet.length },
    auditedRefundsLeftOnTheirPaymentLedger: auditedRefunds.length - platformRefundIds.length
  };
}
