import type { PrismaClient } from '@prisma/client';
import { createHmac, randomBytes, randomUUID } from 'crypto';

function buildSecret() {
  return `whsec_${randomBytes(16).toString('hex')}`;
}

function signPayload(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
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
          'X-Event-Type': eventType,
          'X-Delivery-Id': randomUUID()
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
        responseBody: responseBody ?? undefined,
        durationMs: Date.now() - started,
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
  }
};
