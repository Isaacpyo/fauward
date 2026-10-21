import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tenantStorage } from '../context/tenant.context.js';

// L10 (WP-2.13): staff replay a dead-lettered tenant webhook delivery from the console; the worker re-sends the stored
// payload signed with the endpoint's current secret and fills in the replay row; failures become one console activity
// per endpoint per hour.

const queued = vi.hoisted(() => [] as Array<{ name: string; data: Record<string, unknown> }>);
vi.mock('./queues.js', () => ({
  bullmqConnection: {},
  webhookQueue: { add: vi.fn(async (name: string, data: Record<string, unknown>) => queued.push({ name, data })) },
  analyticsQueue: {},
  notificationQueue: {},
  outboxQueue: {},
  scheduledJobsQueue: {}
}));
vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn();
    close = vi.fn(async () => undefined);
    getJobCounts = vi.fn(async () => ({}));
  },
  Worker: class {
    on = vi.fn();
    close = vi.fn(async () => undefined);
  }
}));
vi.mock('../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_1', email: 'ops@fauward.com', name: 'Ops', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(['platform.integrations.read', 'platform.integrations.write']), jit: new Map(), permissions: [] }))
}));
vi.mock('../services/platform-audit.service.js', () => ({ writePlatformAuditLog: vi.fn(async () => ({ id: 'aud' })) }));

type Row = Record<string, unknown> & { id: string };

function createStore() {
  const endpoint = { id: 'ep_1', tenantId: 'tenant_a', url: 'https://erp.northwind.test/hooks', secret: 'rotated-secret', isActive: true };
  const deliveries: Row[] = [
    { id: 'del_1', tenantId: 'tenant_a', endpointId: 'ep_1', eventType: 'shipment.updated', payload: { shipmentId: 'sh_1', status: 'DELIVERED' }, status: 'FAILED', hmacSignature: 'sha256=old', deadLetteredAt: new Date(), endpoint }
  ];
  const activity = new Map<string, Record<string, unknown>>();
  const contexts: unknown[] = [];
  return {
    endpoint,
    deliveries,
    activity,
    contexts,
    webhookDelivery: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => deliveries.find((row) => row.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string; endpointId: string } }) => deliveries.find((row) => row.id === where.id && row.tenantId === where.tenantId && row.endpointId === where.endpointId) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        contexts.push(tenantStorage.getStore());
        const row = { id: `del_${deliveries.length + 1}`, ...data };
        deliveries.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; tenantId: string }; data: Record<string, unknown> }) => {
        contexts.push(tenantStorage.getStore());
        const hit = deliveries.filter((row) => row.id === where.id && row.tenantId === where.tenantId);
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      })
    },
    webhookEndpoint: { findUnique: vi.fn(async () => endpoint) },
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Record<string, unknown> }) => {
        if (!activity.has(where.dedupeKey)) activity.set(where.dedupeKey, { id: `act_${activity.size + 1}`, ...create });
        return activity.get(where.dedupeKey)!;
      })
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  queued.length = 0;
});

describe('L10 webhook replay (WP-2.13)', () => {
  it('ACC-INT-3 ACC-L10-1 console replay re-sends the stored payload with a fresh signature and fills in the replay row', async () => {
    const store = createStore();
    const app = Fastify();
    app.decorate('prisma', store as never);
    app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
    const { registerConsoleOperationsRoutes } = await import('../modules/internal/platform/operations.routes.js');
    await registerConsoleOperationsRoutes(app);

    expect((await app.inject({ method: 'POST', url: '/api/internal/integrations/webhooks/deliveries/del_1/replay', payload: {} })).statusCode).toBe(400);
    const replay = await app.inject({ method: 'POST', url: '/api/internal/integrations/webhooks/deliveries/del_1/replay', payload: { reason: 'Customer ERP was down overnight' } });
    expect(replay.statusCode).toBe(200);
    const { replayDeliveryId } = replay.json() as { replayDeliveryId: string };
    expect([...store.activity.values()]).toEqual([expect.objectContaining({ service: 'platform.integrations', type: 'webhook.replayed', tenantId: 'tenant_a', actorType: 'STAFF' })]);
    expect(queued).toHaveLength(1);

    const sent: Array<{ body: string; headers: Record<string, string> }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      sent.push(init);
      return { ok: true, status: 200, text: async () => 'ok' };
    }));
    store.contexts.length = 0;
    const { processWebhookJob } = await import('./webhook.worker.js');
    await processWebhookJob({ prisma: store, redis: { publish: vi.fn(async () => 1) }, log: { warn: vi.fn(), error: vi.fn() } } as never, { id: 'job_1', data: queued[0].data, attemptsMade: 0 });

    const body = JSON.stringify({ shipmentId: 'sh_1', status: 'DELIVERED' });
    const fresh = `sha256=${createHmac('sha256', 'rotated-secret').update(body).digest('hex')}`;
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe(body);
    expect(sent[0].headers['X-Fauward-Signature']).toBe(fresh);
    expect(store.deliveries.find((row) => row.id === replayDeliveryId)).toMatchObject({ status: 'DELIVERED', responseStatus: 200, hmacSignature: fresh });
    // The worker writes in system context (WebhookDelivery is tenant-scoped; no request context in a worker).
    expect(store.contexts.every((ctx) => (ctx as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin === true)).toBe(true);
    await app.close();
  });

  it('failed deliveries record one webhook.delivery_failed activity per endpoint per hour', async () => {
    const store = createStore();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => 'down' })));
    const { processWebhookJob } = await import('./webhook.worker.js');
    const deps = { prisma: store, redis: { publish: vi.fn(async () => 1) }, log: { warn: vi.fn(), error: vi.fn() } } as never;
    const job = { id: 'job_2', data: { endpointId: 'ep_1', eventType: 'shipment.updated', tenantId: 'tenant_a', shipmentId: 'sh_1', payload: { shipmentId: 'sh_1' } }, attemptsMade: 0 };
    await expect(processWebhookJob(deps, job)).rejects.toThrow('Webhook responded with status 503');
    await expect(processWebhookJob(deps, { ...job, attemptsMade: 1 })).rejects.toThrow();
    const failures = [...store.activity.values()].filter((row) => row.type === 'webhook.delivery_failed');
    expect(failures).toEqual([expect.objectContaining({ service: 'platform.integrations', tenantId: 'tenant_a', subjectId: 'ep_1', severity: 'ATTENTION' })]);
  });
});
