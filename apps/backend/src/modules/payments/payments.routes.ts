import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PaymentStatus } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { resolveIdempotency, storeIdempotencyResult } from '../../shared/middleware/idempotency.js';
import { handleDunningEvent } from './billing.service.js';
import { stripeService } from './stripe.service.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
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

    const intent = await stripeService.createPaymentIntent({
      amountMinor,
      currency: (payload.currency ?? shipment.currency ?? 'GBP').toLowerCase(),
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
        gatewayRef: intent.id
      },
      update: {
        amount,
        currency: shipment.currency,
        status: PaymentStatus.PENDING,
        gatewayRef: intent.id
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
    const event = await stripeService.handleWebhook(request.body);
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

    reply.send({ received: true });
  });
}
