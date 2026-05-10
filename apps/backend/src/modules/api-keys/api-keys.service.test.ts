import { createHash } from 'crypto';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerApiKeyRoutes } from './api-keys.routes.js';
import { registerShipmentRoutes } from '../shipments/shipments.routes.js';
import { authenticate, requiredApiScope } from '../../shared/middleware/authenticate.js';

function hashKey(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

function makeApiKey(raw: string, overrides: Partial<any>) {
  return {
    id: overrides.id ?? raw,
    tenantId: overrides.tenantId ?? 'tenant-a',
    tenant: {
      id: overrides.tenantId ?? 'tenant-a',
      slug: overrides.tenantId ?? 'tenant-a',
      name: overrides.tenantId ?? 'tenant-a',
      plan: 'ENTERPRISE',
      status: 'ACTIVE'
    },
    name: overrides.name ?? null,
    keyHash: hashKey(raw),
    keyPrefix: raw.slice(0, 8),
    scopes: overrides.scopes ?? ['shipments:read'],
    isSandbox: overrides.isSandbox ?? false,
    isActive: true,
    expiresAt: null,
    monthlyRequestCount: 0
  };
}

async function buildApp() {
  const liveRaw = 'fw_live_1234567890abcdef';
  const sandboxRaw = 'fw_sandbox_1234567890abcdef';
  const writeRaw = 'fw_write_1234567890abcdef';
  const tenantBRaw = 'fw_tenantb_1234567890abcdef';
  const usageARaw = 'fw_usagea_1234567890abcdef';
  const keys = [
    makeApiKey(liveRaw, { id: 'key-live', name: 'Live key', scopes: ['shipments:read'], isSandbox: false }),
    makeApiKey(sandboxRaw, { id: 'key-sandbox', name: 'Sandbox key', scopes: ['shipments:read'], isSandbox: true }),
    makeApiKey(writeRaw, { id: 'key-write', name: 'Write key', scopes: ['shipments:read', 'shipments:write'], isSandbox: false }),
    makeApiKey(usageARaw, { id: 'key-usage-a', name: 'Tenant A usage key', scopes: ['api-keys:read'] }),
    makeApiKey(tenantBRaw, { id: 'key-b', tenantId: 'tenant-b', name: 'Tenant B key', scopes: ['api-keys:read'] })
  ];
  const shipments = [
    { id: 'ship-live', tenantId: 'tenant-a', trackingNumber: 'LIVE-1', status: 'PENDING', isSandbox: false },
    { id: 'ship-sandbox', tenantId: 'tenant-a', trackingNumber: 'SANDBOX-1', status: 'PENDING', isSandbox: true },
    { id: 'ship-b', tenantId: 'tenant-b', trackingNumber: 'B-1', status: 'PENDING', isSandbox: false }
  ];
  const usageEvents: any[] = [
    {
      id: 'usage-1',
      tenantId: 'tenant-a',
      apiKeyId: 'key-live',
      apiKey: { id: 'key-live', name: 'Live key', keyPrefix: 'fw_live_' },
      endpoint: '/api/v1/shipments',
      method: 'GET',
      statusCode: 200,
      latencyMs: 40,
      timestamp: new Date('2026-05-02T10:00:00.000Z')
    },
    {
      id: 'usage-2',
      tenantId: 'tenant-a',
      apiKeyId: 'key-live',
      apiKey: { id: 'key-live', name: 'Live key', keyPrefix: 'fw_live_' },
      endpoint: '/api/v1/shipments',
      method: 'GET',
      statusCode: 500,
      latencyMs: 60,
      timestamp: new Date('2026-05-02T11:00:00.000Z')
    },
    {
      id: 'usage-b',
      tenantId: 'tenant-b',
      apiKeyId: 'key-b',
      apiKey: { id: 'key-b', name: 'Tenant B key', keyPrefix: 'fw_tena' },
      endpoint: '/api/v1/shipments',
      method: 'GET',
      statusCode: 200,
      latencyMs: 10,
      timestamp: new Date('2026-05-02T10:00:00.000Z')
    }
  ];

  const prisma = {
    apiKey: {
      findFirst: vi.fn(async ({ where }: any) => keys.find((key) => key.keyHash === where.keyHash) ?? null),
      findMany: vi.fn(async ({ where }: any) => keys.filter((key) => key.tenantId === where.tenantId)),
      update: vi.fn(async ({ where, data }: any) => {
        const key = keys.find((item) => item.id === where.id);
        if (key && data.monthlyRequestCount?.increment) key.monthlyRequestCount += data.monthlyRequestCount.increment;
        return key;
      })
    },
    usageRecord: {
      upsert: vi.fn(async () => ({})),
      findMany: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' ? [{ tenantId: 'tenant-a', month: '2026-05', apiCalls: 2 }] : [])
    },
    apiUsageRecord: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `usage-created-${usageEvents.length + 1}`, ...data };
        usageEvents.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: any) => usageEvents.filter((event) => event.tenantId === where.tenantId))
    },
    shipment: {
      findMany: vi.fn(async ({ where }: any) => shipments.filter((shipment) => {
        if (shipment.tenantId !== where.tenantId) return false;
        if (where.isSandbox !== undefined && shipment.isSandbox !== where.isSandbox) return false;
        return true;
      })),
      count: vi.fn(async ({ where }: any) => shipments.filter((shipment) => {
        if (shipment.tenantId !== where.tenantId) return false;
        if (where.isSandbox !== undefined && shipment.isSandbox !== where.isSandbox) return false;
        return true;
      }).length)
    },
    $transaction: vi.fn(async (ops: any[]) => Promise.all(ops))
  };

  const app = Fastify();
  (app as any).decorate('prisma', prisma);
  (app as any).decorate('authenticate', authenticate);
  app.post('/api/v1/test-shipments-write', { preHandler: [authenticate] }, async (_request, reply) => {
    reply.status(201).send({ ok: true });
  });
  app.post('/api/v1/shipments-scope-probe', { preHandler: [authenticate] }, async (_request, reply) => {
    reply.status(201).send({ ok: true });
  });
  await registerShipmentRoutes(app as any);
  await registerApiKeyRoutes(app as any);
  return { app, prisma, raw: { liveRaw, sandboxRaw, writeRaw, tenantBRaw, usageARaw } };
}

describe('API key sandbox isolation, scopes, and usage', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) {
      const current = apps.pop();
      if (current) await current.app.close();
    }
  });

  it('sandbox key cannot read live shipments', async () => {
    const ctx = await buildApp();
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/shipments',
      headers: { authorization: `Bearer ${ctx.raw.sandboxRaw}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.map((shipment: any) => shipment.id)).toEqual(['ship-sandbox']);
  });

  it('live key cannot read sandbox shipments', async () => {
    const ctx = await buildApp();
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/shipments',
      headers: { authorization: `Bearer ${ctx.raw.liveRaw}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.map((shipment: any) => shipment.id)).toEqual(['ship-live']);
  });

  it('maps shipment write endpoints to shipments:write scope', () => {
    expect(requiredApiScope('POST', '/api/v1/shipments')).toBe('shipments:write');
  });

  it('rejects a key with only shipments:read on POST /shipments', async () => {
    const ctx = await buildApp();
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/shipments',
      headers: { authorization: `Bearer ${ctx.raw.liveRaw}` },
      payload: {}
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'INSUFFICIENT_SCOPE',
      required: 'shipments:write',
      provided: ['shipments:read']
    });
  });

  it('allows a key with the correct write scope', async () => {
    const ctx = await buildApp();
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/shipments-scope-probe',
      headers: { authorization: `Bearer ${ctx.raw.writeRaw}` },
      payload: {}
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true });
  });

  it('GET /api/v1/tenant/api-usage returns per-key per-endpoint per-day breakdown', async () => {
    const ctx = await buildApp();
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tenant/api-usage',
      headers: { authorization: `Bearer ${ctx.raw.tenantBRaw}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.breakdown).toEqual([
      expect.objectContaining({
        keyId: 'key-b',
        endpoint: '/api/v1/shipments',
        method: 'GET',
        date: '2026-05-02',
        requestCount: 1,
        errorCount: 0,
        avgLatencyMs: 10
      })
    ]);
  });

  it('tenant A cannot see tenant B API usage', async () => {
    const ctx = await buildApp();
    apps.push(ctx);

    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tenant/api-usage',
      headers: { authorization: `Bearer ${ctx.raw.usageARaw}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.breakdown.map((row: any) => row.keyId)).toEqual(['key-live']);
  });
});
