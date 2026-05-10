import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queueAdd = vi.hoisted(() => vi.fn(async () => ({ id: 'queued-job' })));

vi.mock('../../queues/queues.js', () => ({
  webhookQueue: {
    add: queueAdd
  }
}));

import {
  WEBHOOK_MAX_FAILURES,
  WEBHOOK_RETRY_DELAYS_MS,
  formatWebhookSignature,
  getWebhookEventId,
  getWebhookRetryDelayMs,
  shouldDeadLetterWebhookAttempt,
  webhooksService
} from './webhooks.service.js';

function buildPrisma() {
  const endpoint = {
    id: 'endpoint-1',
    tenantId: 'tenant-1',
    url: 'https://receiver.example/webhooks',
    secret: 'whsec_test',
    events: ['shipment.created'],
    isActive: true
  };
  const deliveries: any[] = [];

  const prisma = {
    webhookEndpoint: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.id && where.id !== endpoint.id) return null;
        if (where.tenantId && where.tenantId !== endpoint.tenantId) return null;
        return endpoint;
      })
    },
    webhookDelivery: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `delivery-${deliveries.length + 1}`, createdAt: new Date(), ...data };
        deliveries.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const row = deliveries.find((delivery) => {
          if (where.id && delivery.id !== where.id) return false;
          if (where.tenantId && delivery.tenantId !== where.tenantId) return false;
          if (where.endpointId && delivery.endpointId !== where.endpointId) return false;
          return true;
        });
        return row && include?.endpoint ? { ...row, endpoint } : row ?? null;
      }),
      findMany: vi.fn(async (args: any) => ({ args }))
    }
  };

  return { prisma, endpoint, deliveries };
}

describe('webhooks service hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds an HMAC signature on delivery that matches the endpoint secret and raw body', async () => {
    const { prisma, endpoint } = buildPrisma();
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';
    vi.stubGlobal('fetch', vi.fn(async (_url, init: any) => {
      capturedHeaders = init.headers;
      capturedBody = init.body;
      return {
        ok: true,
        status: 200,
        text: async () => 'ok'
      };
    }));

    await webhooksService.sendTest(prisma as any, endpoint.tenantId, endpoint.id, { shipmentId: 'ship-1' }, 'shipment.created');

    const expected = `sha256=${createHmac('sha256', endpoint.secret).update(capturedBody).digest('hex')}`;
    expect(capturedHeaders['X-Fauward-Signature']).toBe(expected);
    expect(capturedHeaders['X-Fauward-Event-Id']).toBeTruthy();
    expect(formatWebhookSignature(endpoint.secret, capturedBody)).toBe(expected);
  });

  it('uses the exact five-step retry schedule and dead-letters on the fifth failure', () => {
    expect(WEBHOOK_RETRY_DELAYS_MS).toEqual([60_000, 120_000, 240_000, 480_000, 960_000]);
    expect([1, 2, 3, 4, 5].map((attempt) => getWebhookRetryDelayMs(attempt))).toEqual([
      60_000,
      120_000,
      240_000,
      480_000,
      960_000
    ]);
    expect(shouldDeadLetterWebhookAttempt(WEBHOOK_MAX_FAILURES - 1)).toBe(false);
    expect(shouldDeadLetterWebhookAttempt(WEBHOOK_MAX_FAILURES)).toBe(true);
  });

  it('does not schedule an automatic sixth retry after dead-letter', () => {
    expect(shouldDeadLetterWebhookAttempt(6)).toBe(true);
    expect(getWebhookRetryDelayMs(6)).toBeNull();
  });

  it('manual replay creates a new delivery record and does not clear the dead-lettered delivery', async () => {
    const { prisma, endpoint, deliveries } = buildPrisma();
    const deadLetteredAt = new Date('2026-05-02T10:00:00.000Z');
    deliveries.push({
      id: 'delivery-dead',
      tenantId: endpoint.tenantId,
      endpointId: endpoint.id,
      eventType: 'shipment.created',
      payload: { shipmentId: 'ship-1' },
      status: 'FAILED',
      attemptCount: 5,
      deadLetteredAt
    });

    const result = await webhooksService.replay(prisma as any, endpoint.tenantId, endpoint.id, 'delivery-dead');

    expect(result).toEqual(expect.objectContaining({
      replayQueued: true,
      deliveryId: 'delivery-dead',
      replayDeliveryId: expect.any(String)
    }));
    expect(deliveries.find((delivery) => delivery.id === 'delivery-dead')?.deadLetteredAt).toBe(deadLetteredAt);
    expect(deliveries).toHaveLength(2);
    expect(deliveries[1]).toEqual(expect.objectContaining({
      status: 'PENDING',
      attemptCount: 0,
      hmacSignature: expect.stringMatching(/^sha256=/)
    }));
  });

  it('X-Fauward-Event-Id is stable across retries for the same queued event', () => {
    expect(getWebhookEventId('bull-job-123')).toBe('bull-job-123');
    expect(getWebhookEventId('bull-job-123')).toBe('bull-job-123');
  });
});
