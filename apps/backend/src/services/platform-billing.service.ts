import type { FastifyInstance } from 'fastify';
import { Prisma, type LedgerKind } from '@prisma/client';
import { z } from 'zod';
import { publishActivity, recordActivity, type ActivityInput } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';
import { liftDunningSuspensionForInvoice, type SuspensionActor } from './tenant-suspension.service.js';
import { currencyDecimals, toMinorUnits } from '../modules/payments/stripe.service.js';

// Fauward → tenant billing (revenue.billing, D4): every row here is kind PLATFORM. Money stays Decimal(12,2) major units
// and is serialised as strings; the currency always comes from the row (ACC-BIL-10).

export const PLATFORM: LedgerKind = 'PLATFORM';

export class BillingError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export type BillingActor = Extract<SuspensionActor, { type: 'STAFF' }>;

const decimalString = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+(\.\d{1,3})?$/.test(value), 'must be a positive decimal amount');

export const createInvoiceBody = z.object({
  tenantId: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  dueDate: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'dueDate must be a date').optional(),
  lineItems: z.array(z.object({ description: z.string().trim().min(1).max(500), quantity: z.number().int().min(1).max(100000), unitAmount: decimalString })).min(1).max(100),
  taxRate: decimalString.optional(),
  notes: z.string().max(2000).optional(),
  send: z.boolean().optional(),
  reason: z.string().optional()
});
export type CreateInvoiceBody = z.infer<typeof createInvoiceBody>;

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function assertCurrencyPrecision(amount: string, currency: string) {
  try {
    toMinorUnits(amount, currency);
  } catch (error) {
    throw new BillingError('INVALID_AMOUNT', 400, error instanceof Error ? error.message : 'Invalid amount');
  }
}

type BalanceInvoice = { total: Prisma.Decimal.Value; payments: Array<{ amount: Prisma.Decimal.Value; refundedAmount: Prisma.Decimal.Value; status: string }>; creditNotes: Array<{ amount: Prisma.Decimal.Value }> };

/** Outstanding = total − completed payments (net of refunds) − credit notes. Never below zero. */
export function invoiceBalance(invoice: BalanceInvoice) {
  const paid = invoice.payments.filter((payment) => payment.status === 'COMPLETED').reduce((sum, payment) => sum.add(payment.amount).minus(payment.refundedAmount), decimal(0));
  const credited = invoice.creditNotes.reduce((sum, credit) => sum.add(credit.amount), decimal(0));
  const outstanding = decimal(invoice.total).minus(paid).minus(credited);
  return { paid, credited, outstanding: Prisma.Decimal.max(outstanding, 0) };
}

function activity(actor: BillingActor, input: Omit<ActivityInput, 'service' | 'actorType' | 'actorId' | 'actorLabel'>): ActivityInput {
  return { service: 'revenue.billing', actorType: 'STAFF', actorId: actor.platformUserId, actorLabel: actor.label, ...input };
}

function nextInvoiceNumber(now: Date) {
  return `FW-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}-${now.getTime().toString(36).toUpperCase()}`;
}

/** Creates a PLATFORM invoice; with `send`, tenant admins get an in-app notification and the invoice email (ACC-BIL-7). */
export async function createPlatformInvoice(app: FastifyInstance, body: CreateInvoiceBody, actor: BillingActor) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: body.tenantId }, select: { id: true, name: true, defaultCurrency: true, taxExempt: true, closedAt: true } });
  if (!tenant) throw new BillingError('TENANT_NOT_FOUND', 404, 'Tenant not found');
  if (tenant.closedAt) throw new BillingError('TENANT_CLOSED', 409, 'The tenant is closed.');
  const currency = body.currency ?? tenant.defaultCurrency;
  const decimals = currencyDecimals(currency);
  for (const item of body.lineItems) assertCurrencyPrecision(item.unitAmount, currency);

  const subtotal = body.lineItems.reduce((sum, item) => sum.add(decimal(item.unitAmount).mul(item.quantity)), decimal(0));
  const taxRate = tenant.taxExempt ? decimal(0) : decimal(body.taxRate ?? '0');
  const taxAmount = subtotal.mul(taxRate).div(100).toDecimalPlaces(decimals);
  const total = subtotal.add(taxAmount);
  const now = new Date();

  const { invoice, row } = await app.prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        kind: PLATFORM,
        tenantId: tenant.id,
        invoiceNumber: nextInvoiceNumber(now),
        lineItems: body.lineItems.map((item) => ({ description: item.description, quantity: item.quantity, unitAmount: decimal(item.unitAmount).toFixed(decimals) })),
        subtotal: subtotal.toDecimalPlaces(decimals),
        taxRate,
        taxAmount,
        total: total.toDecimalPlaces(decimals),
        currency,
        status: body.send ? 'SENT' : 'DRAFT',
        sentAt: body.send ? now : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes,
        createdBy: actor.platformUserId
      }
    });
    const row = await recordActivity(
      tx,
      activity(actor, {
        type: 'invoice.created',
        tenantId: tenant.id,
        subjectType: 'invoice',
        subjectId: invoice.id,
        summary: `${tenant.name}: invoice ${invoice.invoiceNumber} for ${invoice.total.toFixed(decimals)} ${currency}${body.send ? ' sent' : ' drafted'}`,
        consoleLink: `/revenue/billing/invoices/${invoice.id}`,
        dedupeKey: `invoice.created:${invoice.id}`
      })
    );
    return { invoice, row };
  });
  publishActivity(app.redis, row, app.log);

  if (body.send) {
    await notifyTenantAdmins(app, {
      tenantId: tenant.id,
      event: 'billing.invoice_from_fauward',
      title: `New invoice from Fauward: ${invoice.invoiceNumber}`,
      body: `${invoice.total.toFixed(decimals)} ${currency}${invoice.dueDate ? `, due ${invoice.dueDate.toISOString().slice(0, 10)}` : ''}`,
      link: '/settings?tab=billing',
      email: { template: 'invoice_sent', data: { tenantName: tenant.name, invoiceNumber: invoice.invoiceNumber, total: invoice.total.toFixed(decimals), currency } }
    });
  }
  return invoice;
}

function loadInvoice(app: FastifyInstance, invoiceId: string) {
  return app.prisma.invoice.findUnique({
    where: { id: invoiceId, kind: PLATFORM },
    include: { tenant: { select: { id: true, name: true } }, payments: { where: { kind: PLATFORM } }, creditNotes: { where: { kind: PLATFORM } } }
  });
}

/** Void a PLATFORM invoice; refused once any payment exists (ACC-BIL-9). */
export async function voidPlatformInvoice(app: FastifyInstance, invoiceId: string, reason: string, actor: BillingActor) {
  const invoice = await loadInvoice(app, invoiceId);
  if (!invoice) throw new BillingError('INVOICE_NOT_FOUND', 404, 'Invoice not found');
  if (invoice.status === 'VOID') throw new BillingError('ALREADY_VOID', 409, 'The invoice is already void.');
  if (invoice.payments.some((payment) => payment.status !== 'FAILED')) {
    throw new BillingError('PAYMENTS_EXIST', 409, 'This invoice has payments; refund or credit it instead of voiding.');
  }
  const { voided, row } = await app.prisma.$transaction(async (tx) => {
    const voided = await tx.invoice.update({ where: { id: invoice.id, kind: PLATFORM }, data: { status: 'VOID', voidedAt: new Date() } });
    const row = await recordActivity(
      tx,
      activity(actor, { type: 'invoice.voided', tenantId: invoice.tenantId, subjectType: 'invoice', subjectId: invoice.id, summary: `${invoice.tenant.name}: invoice ${invoice.invoiceNumber} voided — ${reason}`, severity: 'ATTENTION', consoleLink: `/revenue/billing/invoices/${invoice.id}`, dedupeKey: `invoice.voided:${invoice.id}` })
    );
    return { voided, row };
  });
  publishActivity(app.redis, row, app.log);
  return voided;
}

export const manualPaymentBody = z.object({ invoiceId: z.string().min(1), amount: decimalString, method: z.string().trim().min(1).max(50).default('BANK_TRANSFER'), reference: z.string().trim().max(200).optional(), reason: z.string() });

/**
 * Records a manual (bank transfer) payment against a PLATFORM invoice; marks it PAID once the balance is settled and
 * lifts a DUNNING suspension opened for that invoice (D3).
 */
export async function recordManualPayment(app: FastifyInstance, body: z.infer<typeof manualPaymentBody>, actor: BillingActor) {
  const invoice = await loadInvoice(app, body.invoiceId);
  if (!invoice) throw new BillingError('INVOICE_NOT_FOUND', 404, 'Invoice not found');
  if (invoice.status === 'VOID') throw new BillingError('INVOICE_VOID', 409, 'The invoice is void.');
  assertCurrencyPrecision(body.amount, invoice.currency);
  const amount = decimal(body.amount);
  const { outstanding } = invoiceBalance(invoice);
  if (amount.gt(outstanding)) {
    throw new BillingError('OVERPAYMENT', 409, `The payment of ${amount.toFixed(2)} ${invoice.currency} is more than the outstanding ${outstanding.toFixed(2)} ${invoice.currency}.`, { outstanding: outstanding.toFixed(2), currency: invoice.currency });
  }
  const settled = amount.eq(outstanding);
  const { payment, row } = await app.prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: { kind: PLATFORM, tenantId: invoice.tenantId, invoiceId: invoice.id, amount, currency: invoice.currency, method: body.method, status: 'COMPLETED', gatewayRef: body.reference ?? null }
    });
    await tx.invoice.update({ where: { id: invoice.id, kind: PLATFORM }, data: settled ? { status: 'PAID', paidAt: new Date() } : { status: 'PARTIALLY_PAID' } });
    const row = await recordActivity(
      tx,
      activity(actor, {
        type: 'payment.recorded',
        tenantId: invoice.tenantId,
        subjectType: 'payment',
        subjectId: payment.id,
        summary: `${invoice.tenant.name}: ${amount.toFixed(2)} ${invoice.currency} received for ${invoice.invoiceNumber}${settled ? ' (paid in full)' : ''}`,
        consoleLink: `/revenue/billing/invoices/${invoice.id}`,
        dedupeKey: `payment.recorded:${payment.id}`
      })
    );
    return { payment, row };
  });
  publishActivity(app.redis, row, app.log);
  let liftedSuspension = false;
  if (settled) {
    for (const ref of [invoice.id, invoice.stripeInvoiceId].filter((value): value is string => Boolean(value))) {
      const lifted = await liftDunningSuspensionForInvoice(app, { tenantId: invoice.tenantId, invoiceRef: ref, actor });
      liftedSuspension = liftedSuspension || Boolean(lifted);
    }
  }
  return { payment, invoiceStatus: settled ? 'PAID' : 'PARTIALLY_PAID', liftedSuspension };
}

export const creditNoteBody = z.object({ invoiceId: z.string().min(1), amount: decimalString, reason: z.string() });

/** A credit note reduces a PLATFORM invoice's balance and can never exceed it (ACC-BIL-8). */
export async function createPlatformCreditNote(app: FastifyInstance, body: z.infer<typeof creditNoteBody>, actor: BillingActor) {
  const invoice = await loadInvoice(app, body.invoiceId);
  if (!invoice) throw new BillingError('INVOICE_NOT_FOUND', 404, 'Invoice not found');
  if (invoice.status === 'VOID') throw new BillingError('INVOICE_VOID', 409, 'The invoice is void.');
  assertCurrencyPrecision(body.amount, invoice.currency);
  const amount = decimal(body.amount);
  const { outstanding } = invoiceBalance(invoice);
  if (amount.gt(outstanding)) {
    throw new BillingError('CREDIT_EXCEEDS_BALANCE', 409, `A credit of ${amount.toFixed(2)} ${invoice.currency} is more than the outstanding ${outstanding.toFixed(2)} ${invoice.currency}.`, { outstanding: outstanding.toFixed(2), currency: invoice.currency });
  }
  const { credit, row } = await app.prisma.$transaction(async (tx) => {
    const credit = await tx.creditNote.create({
      data: { kind: PLATFORM, tenantId: invoice.tenantId, invoiceId: invoice.id, creditNumber: `FWCN-${Date.now().toString(36).toUpperCase()}`, amount, currency: invoice.currency, reason: body.reason }
    });
    if (amount.eq(outstanding)) await tx.invoice.update({ where: { id: invoice.id, kind: PLATFORM }, data: { status: 'PAID', paidAt: new Date() } });
    const row = await recordActivity(
      tx,
      activity(actor, { type: 'credit_note.created', tenantId: invoice.tenantId, subjectType: 'credit_note', subjectId: credit.id, summary: `${invoice.tenant.name}: credit ${amount.toFixed(2)} ${invoice.currency} on ${invoice.invoiceNumber}`, consoleLink: `/revenue/billing/invoices/${invoice.id}`, dedupeKey: `credit_note.created:${credit.id}` })
    );
    return { credit, row };
  });
  publishActivity(app.redis, row, app.log);
  return credit;
}
