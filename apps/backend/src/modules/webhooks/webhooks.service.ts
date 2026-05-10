import type { PrismaClient } from '@prisma/client';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { webhookQueue } from '../../queues/queues.js';

export const WEBHOOK_RETRY_DELAYS_MS = [60_000, 120_000, 240_000, 480_000, 960_000] as const;
export const WEBHOOK_MAX_FAILURES = 5;

function buildSecret() {
  return `whsec_${randomBytes(16).toString('hex')}`;
}

export function signWebhookPayload(secret: string, rawPayloadBody: string) {
  return createHmac('sha256', secret).update(rawPayloadBody).digest('hex');
}

export function formatWebhookSignature(secret: string, rawPayloadBody: string) {
  return `sha256=${signWebhookPayload(secret, rawPayloadBody)}`;
}

export function getWebhookRetryDelayMs(attempt: number) {
  return WEBHOOK_RETRY_DELAYS_MS[attempt - 1] ?? null;
}

export function shouldDeadLetterWebhookAttempt(attempt: number) {
  return attempt >= WEBHOOK_MAX_FAILURES;
}

export function getWebhookEventId(jobId?: string | number | null) {
  return String(jobId ?? randomUUID());
}

function signPayload(secret: string, payload: string) {
  return signWebhookPayload(secret, payload);
}

export const webhooksService = {
  async list(prisma: PrismaClient, tenantId: string) {
    return prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
  },
  async create(prisma: PrismaClient, tenantId: string, data: { url: string; events: string[] }) {
    return prisma.webhookEndpoint.create({
      data: {
        tenantId,
        url: data.url,
        secret: buildSecret(),
        events: data.events ?? [],
        isActive: true
      }
    });
  },
  async update(
    prisma: PrismaClient,
    tenantId: string,
    endpointId: string,
    data: { url?: string; events?: string[]; isActive?: boolean }
  ) {
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId }
    });
    if (!endpoint) return null;

    return prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        url: data.url ?? endpoint.url,
        events: data.events ?? endpoint.events,
        isActive: data.isActive ?? endpoint.isActive
      }
    });
  },
  async remove(prisma: PrismaClient, tenantId: string, endpointId: string) {
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId }
    });
    if (!endpoint) return false;

    await prisma.$transaction([
      prisma.webhookDelivery.deleteMany({
        where: { tenantId, endpointId: endpoint.id }
      }),
      prisma.webhookEndpoint.delete({
        where: { id: endpoint.id }
      })
    ]);
    return true;
  },
  async sendTest(
    prisma: PrismaClient,
    tenantId: string,
    endpointId: string,
    payload?: Record<string, unknown>,
    eventType = 'webhook.test'
  ) {
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId }
    });
    if (!endpoint) return null;

    const bodyPayload = payload ?? {
      test: true,
      tenantId,
      endpointId: endpoint.id,
      timestamp: new Date().toISOString()
    };
    const rawBody = JSON.stringify(bodyPayload);
    const signature = signPayload(endpoint.secret, rawBody);
    const eventId = getWebhookEventId();

    const started = Date.now();
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let status: 'DELIVERED' | 'FAILED' = 'DELIVERED';

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Fauward-Signature': `sha256=${signature}`,
          'X-Fauward-Event-Id': eventId,
          'X-Event-Type': eventType,
          'X-Delivery-Id': eventId
        },
        body: rawBody
      });
      responseStatus = response.status;
      responseBody = await response.text();
      if (!response.ok) status = 'FAILED';
    } catch (error) {
      status = 'FAILED';
      responseBody = error instanceof Error ? error.message : 'Test webhook failed';
    }

    const delivery = await prisma.webhookDelivery.create({
      data: {
        tenantId,
        endpointId: endpoint.id,
        eventType,
        payload: bodyPayload as any,
        responseStatus: responseStatus ?? undefined,
        responseCode: responseStatus ?? undefined,
        responseBody: responseBody ?? undefined,
        durationMs: Date.now() - started,
        responseLatencyMs: Date.now() - started,
        attemptCount: 1,
        hmacSignature: `sha256=${signature}`,
        status
      }
    });

    return {
      endpointId: endpoint.id,
      deliveryId: delivery.id,
      ok: status === 'DELIVERED',
      statusCode: responseStatus ?? 0,
      latencyMs: delivery.durationMs ?? 0,
      responsePreview: responseBody?.slice(0, 500) ?? ''
    };
  },
  async listDeliveries(prisma: PrismaClient, tenantId: string) {
    return prisma.webhookDelivery.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  },
  async listEndpointDeliveries(prisma: PrismaClient, tenantId: string, endpointId: string) {
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, tenantId } });
    if (!endpoint) return null;
    return prisma.webhookDelivery.findMany({
      where: { tenantId, endpointId: endpoint.id },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  },
  async replay(prisma: PrismaClient, tenantId: string, endpointId: string, deliveryId: string) {
    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, tenantId, endpointId },
      include: { endpoint: true }
    });
    if (!delivery || delivery.endpoint.tenantId !== tenantId) return null;

    const rawBody = JSON.stringify(delivery.payload);
    const signature = formatWebhookSignature(delivery.endpoint.secret, rawBody);
    const eventId = getWebhookEventId();
    const replayDelivery = await prisma.webhookDelivery.create({
      data: {
        tenantId,
        endpointId: delivery.endpointId,
        eventType: delivery.eventType,
        payload: delivery.payload as any,
        status: 'PENDING',
        attempt: 1,
        attemptCount: 0,
        hmacSignature: signature
      }
    });

    await webhookQueue.add(
      delivery.eventType,
      {
        endpointId: delivery.endpointId,
        eventType: delivery.eventType,
        payload: delivery.payload,
        tenantId: delivery.tenantId,
        replayOfDeliveryId: delivery.id,
        replayDeliveryId: replayDelivery.id,
        shipmentId: typeof (delivery.payload as Record<string, unknown>)?.shipmentId === 'string'
          ? (delivery.payload as Record<string, unknown>).shipmentId
          : 'manual-replay'
      },
      {
        jobId: eventId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 60_000 }
      }
    );
    return { replayQueued: true, deliveryId: delivery.id, replayDeliveryId: replayDelivery.id };
  },
  async platformFailures(prisma: PrismaClient) {
    return prisma.webhookDelivery.findMany({
      where: {
        deadLetteredAt: { not: null }
      },
      include: {
        endpoint: { select: { id: true, url: true, tenantId: true } },
        tenant: { select: { id: true, name: true, slug: true } }
      },
      orderBy: { deadLetteredAt: 'desc' },
      take: 200
    });
  }
};
