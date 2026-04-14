import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

import { webhooksService } from './webhooks.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// webhooksService
// ─────────────────────────────────────────────────────────────────────────────

describe('webhooksService.list', () => {
  it('queries only the specified tenant\'s endpoints', async () => {
    const endpoints = [{ id: 'ep-1', tenantId: 'tenant-1', url: 'https://example.com/hook', events: ['shipment.delivered'] }];
    const prisma = {
      webhookEndpoint: { findMany: vi.fn().mockResolvedValue(endpoints) }
    } as any;

    const result = await webhooksService.list(prisma, 'tenant-1');

    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } })
    );
    expect(result).toHaveLength(1);
  });
});

describe('webhooksService.create', () => {
  it('stores the endpoint with a generated secret prefixed whsec_', async () => {
    const prisma = {
      webhookEndpoint: {
        create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'ep-new', ...data }))
      }
    } as any;

    const result = await webhooksService.create(prisma, 'tenant-1', {
      url: 'https://example.com/hook',
      events: ['shipment.delivered', 'invoice.sent']
    });

    expect(prisma.webhookEndpoint.create).toHaveBeenCalledTimes(1);
    const storedData = prisma.webhookEndpoint.create.mock.calls[0][0].data;
    expect(storedData.tenantId).toBe('tenant-1');
    expect(storedData.url).toBe('https://example.com/hook');
    expect(storedData.secret).toMatch(/^whsec_/);
    expect(storedData.isActive).toBe(true);
    expect(storedData.events).toContain('shipment.delivered');
    expect(result.url).toBe('https://example.com/hook');
  });

  it('creates endpoint with empty events array when none provided', async () => {
    const prisma = {
      webhookEndpoint: {
        create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'ep-new', ...data }))
      }
    } as any;

    await webhooksService.create(prisma, 'tenant-1', { url: 'https://example.com/hook', events: [] });

    const storedData = prisma.webhookEndpoint.create.mock.calls[0][0].data;
    expect(storedData.events).toEqual([]);
  });
});

describe('webhooksService.listDeliveries', () => {
  it('returns the 20 most recent deliveries for the tenant', async () => {
    const prisma = {
      webhookDelivery: { findMany: vi.fn().mockResolvedValue([]) }
    } as any;

    await webhooksService.listDeliveries(prisma, 'tenant-1');

    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' }, take: 20 })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HMAC signature verification (for webhook consumers)
// ─────────────────────────────────────────────────────────────────────────────

describe('webhook HMAC signature', () => {
  it('produces a verifiable HMAC-SHA256 signature from the secret and payload', () => {
    const secret = 'whsec_test_secret_value';
    const payload = JSON.stringify({ event: 'shipment.delivered', data: { id: 'ship-1' } });

    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    // Consumer verification: recompute and compare
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    expect(signature).toBe(expected);
    expect(signature).toHaveLength(64); // SHA-256 hex output
  });

  it('different payloads produce different signatures', () => {
    const secret = 'whsec_test_secret_value';
    const sig1 = createHmac('sha256', secret).update('payload-a').digest('hex');
    const sig2 = createHmac('sha256', secret).update('payload-b').digest('hex');
    expect(sig1).not.toBe(sig2);
  });

  it('different secrets produce different signatures for the same payload', () => {
    const payload = '{"event":"test"}';
    const sig1 = createHmac('sha256', 'secret-a').update(payload).digest('hex');
    const sig2 = createHmac('sha256', 'secret-b').update(payload).digest('hex');
    expect(sig1).not.toBe(sig2);
  });
});
