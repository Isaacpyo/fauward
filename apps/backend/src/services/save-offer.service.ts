import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type SaveOffer } from '@prisma/client';
import { stripeService } from '../modules/payments/stripe.service.js';
import { invoiceBalance } from './platform-billing.service.js';
import { recordAndPublishActivity, staffActor } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';

// Save offers (revenue.dunning; create + approve + redeem ship in WP-2.7). Staff create a PENDING offer, a second step
// approves it and generates a code the tenant sees in Billing; the tenant redeems it once: a one-off Stripe coupon on
// a Stripe-managed subscription, otherwise a PLATFORM credit note on the oldest open Fauward invoice.

type OfferApp = FastifyInstance;

export class SaveOfferError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateOfferCode() {
  const bytes = randomBytes(8);
  return `SAVE-${[...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')}`;
}

export function presentSaveOffer(offer: SaveOffer) {
  return {
    id: offer.id,
    tenantId: offer.tenantId,
    discount: offer.discount.toFixed(2),
    status: offer.status,
    code: offer.code,
    reason: offer.reason,
    expiresAt: offer.expiresAt.toISOString(),
    redeemedAt: offer.redeemedAt?.toISOString() ?? null,
    approvedBy: offer.approvedBy,
    createdAt: offer.createdAt.toISOString()
  };
}

export async function approveSaveOffer(app: OfferApp, request: FastifyRequest, input: { id: string; reason: string }) {
  const offer = await app.prisma.saveOffer.findUnique({ where: { id: input.id } });
  if (!offer) throw new SaveOfferError(404, 'NOT_FOUND', 'Save offer not found');
  if (offer.status !== 'PENDING') throw new SaveOfferError(409, 'NOT_PENDING', `This offer is ${offer.status.toLowerCase()}.`);
  if (offer.expiresAt <= new Date()) throw new SaveOfferError(409, 'EXPIRED', 'This offer has expired; create a new one.');
  const code = generateOfferCode();
  const claimed = await app.prisma.saveOffer.updateMany({ where: { id: offer.id, tenantId: offer.tenantId, status: 'PENDING' }, data: { status: 'APPROVED', code, approvedBy: request.platform!.user.id } });
  if (claimed.count !== 1) throw new SaveOfferError(409, 'NOT_PENDING', 'This offer was decided by someone else.');
  const approved = await app.prisma.saveOffer.findFirstOrThrow({ where: { id: offer.id, tenantId: offer.tenantId } });
  await recordAndPublishActivity({ prisma: app.prisma, redis: app.redis, log: request.log }, {
    service: 'revenue.dunning',
    type: 'save_offer.approved',
    tenantId: offer.tenantId,
    ...staffActor(request),
    subjectType: 'save_offer',
    subjectId: offer.id,
    summary: `Save offer of ${offer.discount.toFixed(2)} GBP approved`,
    consoleLink: '/revenue/dunning/save-offers',
    dedupeKey: `save_offer.approved:${offer.id}`,
    metadata: { reason: input.reason }
  });
  await notifyTenantAdmins(app, {
    tenantId: offer.tenantId,
    event: 'save_offer.available',
    title: `A ${offer.discount.toFixed(2)} GBP credit is waiting for you`,
    body: `Redeem code ${code} in Settings → Billing before ${offer.expiresAt.toISOString().slice(0, 10)}.`,
    link: '/settings?tab=billing'
  });
  return presentSaveOffer(approved);
}

export async function redeemSaveOffer(app: OfferApp, request: FastifyRequest, input: { tenantId: string; code: string; userId: string; email: string | null }) {
  const offer = await app.prisma.saveOffer.findFirst({ where: { tenantId: input.tenantId, code: input.code.trim().toUpperCase() } });
  if (!offer) throw new SaveOfferError(404, 'NOT_FOUND', 'This code is not valid for your workspace.');
  if (offer.status !== 'APPROVED' || offer.redeemedAt) throw new SaveOfferError(409, 'ALREADY_REDEEMED', 'This code was already used.');
  if (offer.expiresAt <= new Date()) throw new SaveOfferError(410, 'EXPIRED', 'This code has expired.');
  const now = new Date();
  const claimed = await app.prisma.saveOffer.updateMany({ where: { id: offer.id, tenantId: input.tenantId, status: 'APPROVED', redeemedAt: null }, data: { redeemedAt: now, status: 'REDEEMED' } });
  if (claimed.count !== 1) throw new SaveOfferError(409, 'ALREADY_REDEEMED', 'This code was already used.');
  const release = () => app.prisma.saveOffer.updateMany({ where: { id: offer.id, tenantId: input.tenantId, redeemedAt: now }, data: { redeemedAt: null, status: 'APPROVED' } });

  const subscription = await app.prisma.subscription.findUnique({ where: { tenantId: input.tenantId } });
  let applied: { via: 'STRIPE_COUPON'; couponId: string } | { via: 'CREDIT_NOTE'; creditNoteId: string; invoiceNumber: string; amount: string };
  try {
    if (subscription?.stripeSubscriptionId && stripeService.isConfigured()) {
      const coupon = await stripeService.applyAmountOffCoupon({ subscriptionId: subscription.stripeSubscriptionId, amountMajor: offer.discount.toFixed(2), currency: 'GBP', name: `Fauward save offer ${offer.code}`, idempotencyKey: `save-offer:${offer.id}` });
      await app.prisma.saveOffer.updateMany({ where: { id: offer.id, tenantId: input.tenantId }, data: { stripeCouponId: coupon.couponId } });
      applied = { via: 'STRIPE_COUPON', couponId: coupon.couponId };
    } else {
      const invoices = await app.prisma.invoice.findMany({
        where: { kind: 'PLATFORM', tenantId: input.tenantId, status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] } },
        include: { payments: { where: { kind: 'PLATFORM' } }, creditNotes: { where: { kind: 'PLATFORM' } } },
        orderBy: { createdAt: 'asc' }
      });
      const target = invoices.map((invoice) => ({ invoice, outstanding: invoiceBalance(invoice).outstanding })).find((row) => row.outstanding.gt(0));
      if (!target) throw new SaveOfferError(409, 'NO_OPEN_INVOICE', 'There is no open Fauward invoice to apply this credit to yet. Keep the code and redeem it once your next invoice arrives.');
      const amount = Prisma.Decimal.min(offer.discount, target.outstanding);
      const credit = await app.prisma.$transaction(async (tx) => {
        const note = await tx.creditNote.create({
          data: { kind: 'PLATFORM', tenantId: input.tenantId, invoiceId: target.invoice.id, creditNumber: `FWCN-${Date.now().toString(36).toUpperCase()}`, amount, currency: target.invoice.currency, reason: `Save offer ${offer.code}` }
        });
        if (amount.eq(target.outstanding)) await tx.invoice.update({ where: { id: target.invoice.id, kind: 'PLATFORM' }, data: { status: 'PAID', paidAt: now } });
        await tx.saveOffer.updateMany({ where: { id: offer.id, tenantId: input.tenantId }, data: { redeemedCreditNoteId: note.id } });
        return note;
      });
      applied = { via: 'CREDIT_NOTE', creditNoteId: credit.id, invoiceNumber: target.invoice.invoiceNumber, amount: amount.toFixed(2) };
    }
  } catch (error) {
    await release();
    if (error instanceof SaveOfferError) throw error;
    request.log.error({ err: error, offerId: offer.id }, 'Save offer redemption failed');
    throw new SaveOfferError(502, 'REDEEM_FAILED', 'The credit could not be applied; the code is still valid. Try again shortly.');
  }

  await recordAndPublishActivity({ prisma: app.prisma, redis: app.redis, log: request.log }, {
    service: 'revenue.dunning',
    type: 'save_offer.redeemed',
    tenantId: input.tenantId,
    actorType: 'TENANT_USER',
    actorId: input.userId,
    actorLabel: input.email ?? 'Tenant admin',
    subjectType: 'save_offer',
    subjectId: offer.id,
    summary: applied.via === 'STRIPE_COUPON' ? `Save offer ${offer.code} redeemed as a Stripe coupon` : `Save offer ${offer.code} redeemed: ${applied.amount} GBP credit on ${applied.invoiceNumber}`,
    consoleLink: '/revenue/dunning/save-offers',
    dedupeKey: `save_offer.redeemed:${offer.id}`
  });
  return applied;
}
