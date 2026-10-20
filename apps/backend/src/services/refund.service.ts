import { Prisma, type Payment, type PrismaClient, type Refund } from '@prisma/client';
import { MoneyFormatError, currencyDecimals, toMinorUnits } from '../modules/payments/stripe.service.js';

// Refund integrity (WP-0.6): no over-refunds, refundedAmount kept true, a second approver for manual or large refunds,
// Stripe failures recorded and surfaced as a handled 502.

export const REFUND_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  RECORDED_MANUAL: 'RECORDED_MANUAL',
  REJECTED: 'REJECTED'
} as const;

/** Statuses whose amount is already committed against the payment but not yet in refundedAmount. */
const IN_FLIGHT = [REFUND_STATUS.PENDING_APPROVAL, REFUND_STATUS.PROCESSING];

export class RefundError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'RefundError';
  }
}

export type StripeRefunds = {
  isConfigured(): boolean;
  createRefund(input: { paymentIntentOrCharge: string; amountMajor: string; currency: string; reason?: string; idempotencyKey: string }): Promise<{ id: string; status: string }>;
};

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

export function parseRefundAmount(raw: unknown, currency: string) {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  try {
    if (toMinorUnits(text, currency) <= 0) throw new MoneyFormatError('Amount must be greater than zero');
  } catch (error) {
    throw new RefundError(400, 'INVALID_AMOUNT', error instanceof Error ? error.message : 'Invalid amount');
  }
  return new Prisma.Decimal(text);
}

/** Row lock on the payment so concurrent refunds see each other (Prisma cannot express FOR UPDATE). */
async function lockPayment(tx: Tx, paymentId: string, tenantId: string) {
  await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  const payment = await tx.payment.findFirst({ where: { id: paymentId, tenantId } });
  if (!payment) throw new RefundError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  return payment;
}

async function availableToRefund(tx: Tx, payment: Payment, excludeRefundId?: string) {
  const inFlight = await tx.refund.aggregate({
    where: { paymentId: payment.id, tenantId: payment.tenantId, status: { in: IN_FLIGHT }, ...(excludeRefundId ? { id: { not: excludeRefundId } } : {}) },
    _sum: { amount: true }
  });
  return new Prisma.Decimal(payment.amount).minus(payment.refundedAmount).minus(inFlight._sum.amount ?? 0);
}

function overRefund(amount: Prisma.Decimal, available: Prisma.Decimal, currency: string) {
  return new RefundError(409, 'OVER_REFUND', `Refund of ${amount.toFixed(2)} ${currency} exceeds the refundable balance of ${Prisma.Decimal.max(available, 0).toFixed(2)} ${currency}.`, {
    available: Prisma.Decimal.max(available, 0).toFixed(2),
    currency
  });
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Calls Stripe for a PROCESSING refund; on success settles refundedAmount, on failure records FAILED and throws 502. */
export async function executeStripeRefund<R extends Refund>(db: Db, stripe: StripeRefunds, refund: R, payment: Payment) {
  const currency = refund.currency ?? payment.currency;
  let result: { id: string; status: string };
  try {
    result = await stripe.createRefund({
      paymentIntentOrCharge: payment.gatewayRef!,
      amountMajor: new Prisma.Decimal(refund.amount).toFixed(currencyDecimals(currency)),
      currency,
      reason: refund.reason ?? undefined,
      idempotencyKey: refund.idempotencyKey ?? `refund:${refund.id}`
    });
  } catch (error) {
    const failureReason = (error instanceof Error ? error.message : 'Stripe refund failed').slice(0, 500);
    await db.refund.updateMany({ where: { id: refund.id, tenantId: refund.tenantId }, data: { status: REFUND_STATUS.FAILED, failureReason } });
    throw new RefundError(502, 'VENDOR_ERROR', `Stripe did not accept the refund: ${failureReason}`, { vendor: 'stripe', degraded: true, refundId: refund.id });
  }

  if (result.status === 'failed' || result.status === 'canceled') {
    const failureReason = `Stripe refund ${result.id} returned status ${result.status}`;
    await db.refund.updateMany({ where: { id: refund.id, tenantId: refund.tenantId }, data: { status: REFUND_STATUS.FAILED, failureReason, gatewayRef: result.id } });
    throw new RefundError(502, 'VENDOR_ERROR', failureReason, { vendor: 'stripe', degraded: true, refundId: refund.id });
  }

  await db.$transaction([
    db.refund.updateMany({ where: { id: refund.id, tenantId: refund.tenantId }, data: { status: REFUND_STATUS.SUCCEEDED, gatewayRef: result.id, failureReason: null } }),
    db.payment.updateMany({ where: { id: payment.id, tenantId: payment.tenantId }, data: { refundedAmount: { increment: refund.amount } } })
  ]);
  return { ...refund, status: REFUND_STATUS.SUCCEEDED, gatewayRef: result.id, failureReason: null };
}

export type RequestRefundInput = {
  paymentId: string;
  amount: unknown;
  reason: string;
  idempotencyKey: string;
  actorId: string;
  /** Holder of revenue.invoices.refund.large (roles or active JIT). */
  canRefundLarge: boolean;
};

export async function requestRefund(db: Db, deps: { stripe: StripeRefunds; largeRefundThreshold: string }, input: RequestRefundInput) {
  const existing = await db.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { approvals: true } });
  if (existing) return { refund: existing, created: false, path: existing.status === REFUND_STATUS.PENDING_APPROVAL ? ('approval' as const) : ('stripe' as const) };

  const payment = await db.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment) throw new RefundError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  const amount = parseRefundAmount(input.amount, payment.currency);
  const large = amount.gte(new Prisma.Decimal(deps.largeRefundThreshold));
  const stripeAvailable = Boolean(payment.gatewayRef) && deps.stripe.isConfigured();
  // Manual (no gateway) refunds and large refunds without the .large permission need a second approver.
  const path: 'stripe' | 'approval' = stripeAvailable && (!large || input.canRefundLarge) ? 'stripe' : 'approval';

  let refund: Refund & { approvals: Array<{ id: string; status: string }> };
  try {
    refund = await db.$transaction(async (tx) => {
      const locked = await lockPayment(tx, payment.id, payment.tenantId);
      const available = await availableToRefund(tx, locked);
      if (amount.gt(available)) throw overRefund(amount, available, locked.currency);
      return tx.refund.create({
        data: {
          tenantId: locked.tenantId,
          paymentId: locked.id,
          amount,
          currency: locked.currency,
          reason: input.reason,
          status: path === 'stripe' ? REFUND_STATUS.PROCESSING : REFUND_STATUS.PENDING_APPROVAL,
          initiatedBy: input.actorId,
          idempotencyKey: input.idempotencyKey,
          approvals: path === 'approval' ? { create: { requestedBy: input.actorId, reason: input.reason, status: 'PENDING' } } : undefined
        },
        include: { approvals: true }
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await db.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { approvals: true } });
    if (!raced) throw error;
    return { refund: raced, created: false, path };
  }

  if (path === 'approval') return { refund, created: true, path, large };
  const settled = await executeStripeRefund(db, deps.stripe, refund, payment);
  return { refund: { ...settled, approvals: refund.approvals }, created: true, path, large };
}

export async function decideRefund(db: Db, deps: { stripe: StripeRefunds }, input: { refundId: string; decision: 'APPROVE' | 'REJECT'; actorId: string; reason: string }) {
  const refund = await db.refund.findUnique({ where: { id: input.refundId }, include: { approvals: true, payment: true } });
  if (!refund) throw new RefundError(404, 'REFUND_NOT_FOUND', 'Refund not found');
  const approval = refund.approvals.find((item) => item.status === 'PENDING');
  if (refund.status !== REFUND_STATUS.PENDING_APPROVAL || !approval) throw new RefundError(409, 'REFUND_NOT_PENDING', 'This refund is not awaiting approval.');
  if (approval.requestedBy === input.actorId || refund.initiatedBy === input.actorId) {
    throw new RefundError(403, 'CANNOT_APPROVE_OWN', 'A refund must be decided by someone other than the requester.');
  }
  const decidedAt = new Date();

  if (input.decision === 'REJECT') {
    await db.$transaction([
      db.refundApproval.update({ where: { id: approval.id }, data: { status: 'REJECTED', approvedBy: input.actorId, decidedAt } }),
      db.refund.updateMany({ where: { id: refund.id, tenantId: refund.tenantId }, data: { status: REFUND_STATUS.REJECTED, failureReason: input.reason } })
    ]);
    return { ...refund, status: REFUND_STATUS.REJECTED };
  }

  const useStripe = Boolean(refund.payment.gatewayRef) && deps.stripe.isConfigured();
  const nextStatus = useStripe ? REFUND_STATUS.PROCESSING : REFUND_STATUS.RECORDED_MANUAL;
  await db.$transaction(async (tx) => {
    const locked = await lockPayment(tx, refund.paymentId, refund.tenantId);
    const available = await availableToRefund(tx, locked, refund.id);
    if (new Prisma.Decimal(refund.amount).gt(available)) throw overRefund(new Prisma.Decimal(refund.amount), available, locked.currency);
    await tx.refundApproval.update({ where: { id: approval.id }, data: { status: 'APPROVED', approvedBy: input.actorId, decidedAt } });
    await tx.refund.updateMany({ where: { id: refund.id, tenantId: refund.tenantId }, data: { status: nextStatus } });
    // Manual refunds are settled outside Fauward; refundedAmount moves only once a second person approves.
    if (!useStripe) {
      await tx.payment.updateMany({ where: { id: locked.id, tenantId: locked.tenantId }, data: { refundedAmount: { increment: refund.amount } } });
    }
  });

  if (!useStripe) return { ...refund, status: REFUND_STATUS.RECORDED_MANUAL };
  return executeStripeRefund(db, deps.stripe, { ...refund, status: REFUND_STATUS.PROCESSING }, refund.payment);
}
