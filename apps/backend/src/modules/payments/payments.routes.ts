import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PaymentStatus } from '@prisma/client';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { resolveIdempotency, storeIdempotencyResult } from '../../shared/middleware/idempotency.js';
import { handleDunningEvent } from './billing.service.js';
import { stripeService } from './stripe.service.js';
import { generateTrackingNumber } from '../../shared/utils/trackingNumber.js';
import { createInAppNotifications } from '../notifications/notifications.routes.js';

async function handleReturnPayment(app: FastifyInstance, tenantId: string, returnId: string) {
  const returnReq = await app.prisma.returnRequest.findFirst({
    where: { id: returnId, tenantId },
    include: { shipment: { select: { id: true, originAddress: true, destinationAddress: true, weightKg: true, currency: true, trackingNumber: true, tenantId: true } } }
  });
  if (!returnReq || !returnReq.shipment) return;

  await app.prisma.returnRequest.update({
    where: { id: returnId },
    data: { paymentStatus: 'PAID' as any, feePaidAt: new Date() }
  });

  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const trackingNumber = await generateTrackingNumber(app.prisma, tenant?.name ?? 'FW');

  const reverseShipment = await app.prisma.shipment.create({
    data: {
      tenantId,
      trackingNumber,
      originAddress: returnReq.shipment.destinationAddress as never,
      destinationAddress: returnReq.shipment.originAddress as never,
      status: 'PENDING',
      weightKg: returnReq.shipment.weightKg ?? undefined,
      currency: returnReq.shipment.currency,
      notes: `Return pickup for ${returnId}`,
    }
  });

  await app.prisma.returnRequest.update({
    where: { id: returnId },
    data: { returnPickupShipmentId: reverseShipment.id, status: 'LABEL_ISSUED' as any }
  });

  await app.prisma.shipmentEvent.create({
    data: {
      tenantId,
      shipmentId: returnReq.shipment.id,
      status: 'RETURN_STARTED',
      notes: 'Return pickup shipment created — payment received',
      actorType: 'SYSTEM',
    }
  });

  const ops = await app.prisma.user.findMany({
    where: { tenantId, role: { in: ['TENANT_ADMIN', 'TENANT_MANAGER'] }, isActive: true },
    select: { id: true }
  });

  await createInAppNotifications(app, {
    tenantId,
    userIds: ops.map((u) => u.id),
    type: 'return_payment_received',
    title: `Return payment received for ${returnReq.shipment.trackingNumber}`,
    body: `Reverse pickup shipment ${trackingNumber} created and ready for dispatch.`,
    link: '/returns',
  });
}

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

type StripeBalanceTxn = {
  id: string;
  amount: number;
  currency: string;
  type: string;
  source?: string | { id?: string; metadata?: Record<string, string>; payment_intent?: string | { id?: string; metadata?: Record<string, string> } } | null;
};

function pickTenantIdFromSource(source: StripeBalanceTxn['source']): { tenantId: string | null; sourceId: string | null } {
  if (!source) return { tenantId: null, sourceId: null };
  if (typeof source === 'string') return { tenantId: null, sourceId: source };
  const directMeta = source.metadata?.tenantId;
  if (directMeta) return { tenantId: directMeta, sourceId: source.id ?? null };
  const pi = source.payment_intent;
  if (pi && typeof pi === 'object' && pi.metadata?.tenantId) {
    return { tenantId: pi.metadata.tenantId, sourceId: typeof pi === 'object' ? pi.id ?? source.id ?? null : source.id ?? null };
  }
  return { tenantId: null, sourceId: source.id ?? null };
}

async function ingestStripePayout(app: FastifyInstance, payoutObj: Record<string, unknown>) {
  const payoutId = typeof payoutObj.id === 'string' ? payoutObj.id : null;
  if (!payoutId) return;

  const arrivalDateRaw = payoutObj.arrival_date;
  const arrivalDate = typeof arrivalDateRaw === 'number' ? new Date(arrivalDateRaw * 1000) : new Date();
  const status = typeof payoutObj.status === 'string' ? payoutObj.status.toLowerCase() : 'unknown';
  const currency = (typeof payoutObj.currency === 'string' ? payoutObj.currency : 'gbp').toUpperCase();
  const payoutAmountMinor = typeof payoutObj.amount === 'number' ? payoutObj.amount : 0;

  const txns = (await stripeService.listPayoutBalanceTransactions(payoutId)) as unknown as StripeBalanceTxn[];

  const linesByTenant = new Map<string, Array<{ txn: StripeBalanceTxn; sourceId: string | null }>>();
  for (const txn of txns) {
    const { tenantId, sourceId } = pickTenantIdFromSource(txn.source);
    if (!tenantId) continue;
    const arr = linesByTenant.get(tenantId) ?? [];
    arr.push({ txn, sourceId });
    linesByTenant.set(tenantId, arr);
  }

  for (const [tenantId, lines] of linesByTenant) {
    const tenantAmountMinor = lines.reduce((sum, l) => sum + (l.txn.amount ?? 0), 0);
    const payout = await app.prisma.gatewayPayout.upsert({
      where: { tenantId_providerPayoutId: { tenantId, providerPayoutId: payoutId } },
      create: {
        tenantId,
        provider: 'stripe',
        providerPayoutId: payoutId,
        arrivalDate,
        amount: tenantAmountMinor / 100,
        currency,
        status,
        rawPayload: payoutObj as never
      },
      update: {
        arrivalDate,
        amount: tenantAmountMinor / 100,
        status,
        rawPayload: payoutObj as never
      }
    });

    for (const { txn, sourceId } of lines) {
      const matchedPayment = sourceId
        ? await app.prisma.payment.findFirst({ where: { tenantId, gatewayRef: sourceId } })
        : null;

      await app.prisma.gatewayPayoutLine.upsert({
        where: { tenantId_providerTxnId: { tenantId, providerTxnId: txn.id } },
        create: {
          tenantId,
          payoutId: payout.id,
          providerTxnId: txn.id,
          providerSourceId: sourceId,
          amount: (txn.amount ?? 0) / 100,
          currency: (txn.currency ?? currency).toUpperCase(),
          type: txn.type ?? 'other',
          matchedPaymentId: matchedPayment?.id ?? null,
          rawPayload: txn as never
        },
        update: {
          providerSourceId: sourceId,
          amount: (txn.amount ?? 0) / 100,
          currency: (txn.currency ?? currency).toUpperCase(),
          type: txn.type ?? 'other',
          matchedPaymentId: matchedPayment?.id ?? null,
          rawPayload: txn as never
        }
      });

      if (matchedPayment) {
        await app.prisma.auditLog.create({
          data: {
            tenantId,
            action: 'PAYOUT_LINE_MATCHED',
            resourceType: 'GATEWAY_PAYOUT_LINE',
            resourceId: txn.id,
            metadata: { paymentId: matchedPayment.id, payoutId: payout.id } as never
          }
        });
      }
    }
  }

  if (linesByTenant.size === 0) {
    app.log.warn({ payoutId, payoutAmountMinor }, 'Stripe payout had no tenant-attributable balance transactions');
  }
}

function stablePaymentIntentKey(tenantId: string, shipmentId: string, amountMinor: number, currency: string) {
  const digest = createHash('sha256').update(`${tenantId}:${shipmentId}:${amountMinor}:${currency.toLowerCase()}`).digest('hex').slice(0, 24);
  return `payment-intent:${digest}`;
}

export async function registerPaymentsRoutes(app: FastifyInstance) {
  app.post('/api/v1/payments/intent', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const idempotency = await resolveIdempotency(request, reply);
    if (idempotency.type === 'duplicate') return reply.status(idempotency.statusCode).send(idempotency.response);
    if (idempotency.type === 'processing') return reply.status(409).send({ error: 'Duplicate request in flight' });

    const payload = request.body as { shipmentId?: string; currency?: string };
    if (!payload.shipmentId) {
      return reply.status(400).send({ error: 'shipmentId is required' });
    }

    const shipment = await app.prisma.shipment.findFirst({
      where: { id: payload.shipmentId, tenantId },
      include: { organisation: true }
    });
    if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

    const amount = Number(shipment.price ?? 0);
    const amountMinor = Math.max(0, Math.round(amount * 100));
    const currency = (payload.currency ?? shipment.currency ?? 'GBP').toLowerCase();
    const stripeIdempotencyKey =
      idempotency.type === 'new'
        ? `payment-intent:${tenantId}:${idempotency.key}`
        : stablePaymentIntentKey(tenantId, shipment.id, amountMinor, currency);

    const intent = await stripeService.createPaymentIntent({
      amountMinor,
      currency,
      idempotencyKey: stripeIdempotencyKey,
      customerId: shipment.customerId ?? undefined,
      metadata: {
        tenantId,
        shipmentId: shipment.id
      }
    });

    const payment = await app.prisma.payment.upsert({
      where: { shipmentId: shipment.id },
      create: {
        tenantId,
        shipmentId: shipment.id,
        customerId: shipment.customerId,
        amount,
        currency: shipment.currency,
        status: PaymentStatus.PENDING,
        gatewayRef: intent.id,
        idempotencyKey: stripeIdempotencyKey
      },
      update: {
        amount,
        currency: shipment.currency,
        status: PaymentStatus.PENDING,
        gatewayRef: intent.id,
        idempotencyKey: stripeIdempotencyKey
      }
    });

    const response = {
      clientSecret: intent.clientSecret,
      paymentIntentId: intent.id,
      paymentId: payment.id,
      amount,
      currency: shipment.currency
    };

    if (idempotency.type === 'new') {
      await storeIdempotencyResult(request, idempotency.key, 200, response);
    }

    reply.send(response);
  });

  app.get('/api/v1/payments/billing-status', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const now = new Date();
    const [tenant, overdueInvoiceCount, nextRetry, saveOffer] = await Promise.all([
      app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } }),
      app.prisma.invoice.count({ where: { tenantId, status: 'OVERDUE' } }),
      app.prisma.webhookDelivery.findFirst({
        where: { tenantId, nextRetryAt: { gt: now }, eventType: { contains: 'payment', mode: 'insensitive' } },
        orderBy: { nextRetryAt: 'asc' },
        select: { nextRetryAt: true }
      }),
      app.prisma.saveOffer.findFirst({
        where: { tenantId, status: 'APPROVED', expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const tenantStatus = tenant?.status ?? 'ACTIVE';
    const status =
      tenantStatus === 'SUSPENDED'
        ? 'SUSPENDED'
        : tenantStatus === 'TRIALING'
          ? 'TRIAL'
          : overdueInvoiceCount > 0
            ? 'PAST_DUE'
            : 'ACTIVE';

    reply.send({
      status,
      overdueInvoiceCount,
      nextRetryAt: nextRetry?.nextRetryAt?.toISOString() ?? null,
      saveOffer: saveOffer
        ? {
            discount: Number(saveOffer.discount),
            validUntil: saveOffer.expiresAt.toISOString(),
            code: `SAVE-${saveOffer.id.slice(0, 8).toUpperCase()}`
          }
        : undefined
    });
  });

  app.get('/api/v1/payments/:shipmentId', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const { shipmentId } = request.params as { shipmentId: string };
    const payment = await app.prisma.payment.findFirst({
      where: { tenantId, shipmentId },
      include: { invoice: true }
    });

    if (!payment) return reply.status(404).send({ error: 'Payment not found' });
    reply.send(payment);
  });

  app.post('/api/v1/payments/webhook/stripe', async (request, reply) => {
    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      return reply.status(400).send({ error: 'Missing stripe-signature header' });
    }

    const rawPayload =
      Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}));

    let event;
    try {
      event = await stripeService.handleWebhook(rawPayload, signature);
    } catch (error) {
      app.log.warn({ error }, 'Invalid Stripe webhook signature');
      return reply.status(400).send({ error: 'Invalid webhook signature' });
    }

    const eventAny = event as any;
    const eventType = typeof eventAny.type === 'string' ? eventAny.type : '';

    if (eventType === 'payment_intent.succeeded') {
      const paymentIntentId = String(eventAny.data?.object?.id ?? '');
      const payment = await app.prisma.payment.findFirst({ where: { gatewayRef: paymentIntentId } });
      if (payment) {
        await app.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.COMPLETED,
              gatewayResponse: event as any
            }
          });

          if (payment.invoiceId) {
            await tx.invoice.update({
              where: { id: payment.invoiceId },
              data: {
                status: 'PAID',
                paidAt: new Date()
              }
            });
          }

          await tx.notificationLog.create({
            data: {
              tenantId: payment.tenantId,
              userId: payment.customerId ?? undefined,
              channel: 'EMAIL',
              event: 'payment_received',
              status: 'QUEUED'
            }
          });
        });
      }
    }

    if (eventType === 'payment_intent.payment_failed') {
      const paymentIntentId = String(eventAny.data?.object?.id ?? '');
      const payment = await app.prisma.payment.findFirst({ where: { gatewayRef: paymentIntentId } });
      if (payment) {
        await app.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.FAILED,
              gatewayResponse: event as any
            }
          });

          await tx.notificationLog.create({
            data: {
              tenantId: payment.tenantId,
              userId: payment.customerId ?? undefined,
              channel: 'EMAIL',
              event: 'payment_failed',
              status: 'QUEUED'
            }
          });
        });
      }
    }

    if (eventType === 'invoice.payment_failed') {
      const tenantId = String(eventAny.data?.object?.metadata?.tenantId ?? '');
      const attemptCount = Number(eventAny.data?.object?.attempt_count ?? 1);
      if (tenantId) {
        await handleDunningEvent(app.prisma, {
          tenantId,
          attempt: attemptCount
        });
      }
    }

    if (eventType === 'checkout.session.completed') {
      const sessionObj = eventAny.data?.object ?? {};
      const returnId = String(sessionObj.metadata?.returnId ?? '');
      const sessionTenantId = String(sessionObj.metadata?.tenantId ?? '');
      if (returnId && sessionTenantId) {
        await handleReturnPayment(app, sessionTenantId, returnId);
      }
    }

    if (eventType === 'payout.paid' || eventType === 'payout.updated') {
      await ingestStripePayout(app, eventAny.data?.object ?? {}).catch((err) => {
        app.log.error({ err }, 'Failed to ingest Stripe payout');
      });
    }

    if (eventType === 'radar.early_fraud_warning.created' || eventType === 'review.opened') {
      const object = eventAny.data?.object ?? {};
      const tenantId = String(object.metadata?.tenantId ?? object.payment_intent?.metadata?.tenantId ?? '');
      if (tenantId) {
        await app.prisma.fraudSignal.create({
          data: {
            tenantId,
            source: 'stripe_radar',
            signalType: eventType,
            severity: 'HIGH',
            payload: event as never
          }
        });
      }
    }

    reply.send({ received: true });
  });
}
