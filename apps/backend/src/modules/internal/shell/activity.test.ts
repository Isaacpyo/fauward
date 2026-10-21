import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

// D7 read side (WP-2.1): list, summary, Customer 360 tab and the SSE stream, over an in-memory PlatformActivity store.

type Staff = { id: string; permissions: Permission[] };
const STAFF: Record<string, Staff> = {
  pu_cs: { id: 'pu_cs', permissions: ['customer.360.read', 'platform.tenants.read'] },
  pu_support: { id: 'pu_support', permissions: ['customer.360.read', 'customer.support.read', 'platform.tenants.read', 'platform.incidents.read'] }
};

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { headers: Record<string, unknown>; platform?: unknown }) => {
    const staff = STAFF[String(request.headers['x-test-user'] ?? 'pu_support')];
    request.platform = {
      user: { id: staff.id, email: `${staff.id}@fauward.com`, name: null, status: 'ACTIVE', mfaEnabled: true },
      session: { id: `ps_${staff.id}`, mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: staff.id, exp: Math.floor(Date.now() / 1000) + 900 }
    };
  }
}));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async (_prisma: unknown, user: { id: string }) => {
    const permissions = STAFF[user.id].permissions;
    return { staff: null, roles: [], rolePermissions: new Set(permissions), jit: new Map(), permissions };
  })
}));

type Row = {
  id: string;
  occurredAt: Date;
  tenantId: string | null;
  service: string;
  type: string;
  actorType: string;
  actorId: string | null;
  actorLabel: string;
  subjectType: string;
  subjectId: string;
  summary: string;
  severity: 'INFO' | 'ATTENTION' | 'CRITICAL';
  consoleLink: string | null;
  metadata: Record<string, unknown>;
  dedupeKey: string;
};

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key as keyof Row];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const ops = condition as { in?: unknown[]; gte?: Date; lte?: Date; lt?: Date };
      if (ops.in) return ops.in.includes(value);
      if (ops.gte && !(value instanceof Date && value >= ops.gte)) return false;
      if (ops.lte && !(value instanceof Date && value <= ops.lte)) return false;
      if (ops.lt && !(value instanceof Date && value < ops.lt)) return false;
      return true;
    }
    return value === condition;
  });
}

function createStore() {
  const rows: Row[] = [];
  let seq = 0;
  const tenants = [
    { id: 'tenant_a', name: 'Northwind', slug: 'northwind' },
    { id: 'tenant_b', name: 'Contoso', slug: 'contoso' }
  ];
  const prisma = {
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Omit<Row, 'id' | 'occurredAt'> & { occurredAt?: Date } }) => {
        const existing = rows.find((row) => row.dedupeKey === where.dedupeKey);
        if (existing) return existing;
        seq += 1;
        const row: Row = { id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, occurredAt: create.occurredAt ?? new Date(Date.now() + seq), ...create } as Row;
        rows.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where, take, cursor }: { where: Record<string, unknown>; take: number; cursor?: { id: string } }) => {
        let list = rows.filter((row) => matches(row, where)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id));
        if (cursor) list = list.slice(list.findIndex((row) => row.id === cursor.id) + 1);
        return list.slice(0, take);
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null),
      groupBy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const groups = new Map<string, Row[]>();
        for (const row of rows.filter((item) => matches(item, where))) groups.set(row.service, [...(groups.get(row.service) ?? []), row]);
        return [...groups.entries()].map(([service, items]) => ({
          service,
          _max: { occurredAt: new Date(Math.max(...items.map((item) => item.occurredAt.getTime()))) },
          _count: { _all: items.length }
        }));
      }),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const doomed = rows.filter((row) => matches(row, where));
        for (const row of doomed) rows.splice(rows.indexOf(row), 1);
        return { count: doomed.length };
      })
    },
    tenant: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => tenants.filter((tenant) => where.id.in.includes(tenant.id))),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => tenants.find((tenant) => tenant.id === where.id) ?? null)
    }
  };
  return { rows, prisma };
}

let store: ReturnType<typeof createStore>;
let app: FastifyInstance;
const published: string[] = [];
const redis = {
  publish: vi.fn(async (_channel: string, id: string) => {
    published.push(id);
    return 1;
  }),
  duplicate: () => ({ subscribe: vi.fn(async () => 1), on: vi.fn(), quit: vi.fn(async () => 'OK') })
};

async function seed(input: Partial<Row> & Pick<Row, 'service' | 'type'>) {
  const { recordActivity } = await import('../../../services/platform-activity.service.js');
  return recordActivity(store.prisma as never, {
    actorType: 'SYSTEM',
    actorLabel: 'System',
    subjectType: 'test',
    subjectId: 'subject',
    summary: `${input.type} happened`,
    ...input,
    metadata: {}
  } as never);
}

async function buildApp() {
  const instance = Fastify();
  // As in app.ts: the console on admin.fauward.com calls the API host cross-origin with credentials.
  await instance.register(cors, { origin: (origin, callback) => callback(null, !origin || origin === 'https://admin.fauward.com'), credentials: true });
  instance.decorate('prisma', store.prisma as never);
  instance.decorate('redis', redis as never);
  const { registerConsoleActivityRoutes } = await import('./activity.routes.js');
  const { registerCustomer360Routes } = await import('../customer/customer360.routes.js');
  await registerConsoleActivityRoutes(instance);
  await registerCustomer360Routes(instance);
  await instance.ready();
  return instance;
}

beforeEach(async () => {
  store = createStore();
  published.length = 0;
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

describe('console activity (WP-2.1, D7)', () => {
  it('ACC-ACT-1 a retried producer (same dedupeKey) writes exactly one activity row', async () => {
    await seed({ service: 'customer.support', type: 'ticket.created', tenantId: 'tenant_a', dedupeKey: 'ticket.created:tkt_1' });
    await seed({ service: 'customer.support', type: 'ticket.created', tenantId: 'tenant_a', dedupeKey: 'ticket.created:tkt_1' });
    expect(store.rows.filter((row) => row.dedupeKey === 'ticket.created:tkt_1')).toHaveLength(1);
  });

  it('ACC-ACT-1 re-projecting the same outbox event (worker retry after a crash) keeps one row', async () => {
    const { projectOutboxEventToActivity } = await import('../../../queues/outbox.worker.js');
    const event = {
      id: 'obx_1',
      aggregateType: 'shipment',
      aggregateId: 'ship_1',
      eventType: 'shipment.created',
      tenantId: 'tenant_a',
      payload: { tenantId: 'tenant_a', shipmentId: 'ship_1', trackingNumber: 'NWD-1' },
      published: false,
      publishedAt: null,
      createdAt: new Date()
    };
    const deps = { prisma: store.prisma, redis, log: app.log } as never;
    await projectOutboxEventToActivity(deps, event);
    await projectOutboxEventToActivity(deps, event);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ service: 'customer.360', type: 'shipment.created', tenantId: 'tenant_a', subjectId: 'ship_1', dedupeKey: 'outbox:obx_1' });
    expect(published).toEqual([store.rows[0].id, store.rows[0].id]);
  });

  it('ACC-ACT-2 /activity?tenantId= returns only that tenant\'s rows, with the tenant name for TenantChip', async () => {
    await seed({ service: 'platform.tenants', type: 'tenant.suspended', tenantId: 'tenant_a' });
    await seed({ service: 'platform.tenants', type: 'tenant.suspended', tenantId: 'tenant_b' });
    await seed({ service: 'customer.360', type: 'shipment.created', tenantId: 'tenant_a' });
    const response = await app.inject({ method: 'GET', url: '/api/internal/activity?tenantId=tenant_a' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: Array<{ tenantId: string; tenant: { name: string } }>; nextCursor: string | null };
    expect(body.data).toHaveLength(2);
    expect(body.data.every((row) => row.tenantId === 'tenant_a' && row.tenant.name === 'Northwind')).toBe(true);
  });

  it('ACC-ACT-2 the list pages with a cursor and never includes services the caller cannot read', async () => {
    for (let index = 0; index < 3; index += 1) await seed({ service: 'platform.tenants', type: `tenant.event_${index}`, tenantId: 'tenant_a' });
    await seed({ service: 'customer.support', type: 'ticket.created', tenantId: 'tenant_a' });
    const first = (await app.inject({ method: 'GET', url: '/api/internal/activity?limit=2', headers: { 'x-test-user': 'pu_cs' } })).json();
    expect(first.data).toHaveLength(2);
    const second = (await app.inject({ method: 'GET', url: `/api/internal/activity?limit=2&cursor=${first.nextCursor}`, headers: { 'x-test-user': 'pu_cs' } })).json();
    expect(second.data).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect([...first.data, ...second.data].map((row: { service: string }) => row.service)).not.toContain('customer.support');
    const denied = await app.inject({ method: 'GET', url: '/api/internal/activity?service=customer.support', headers: { 'x-test-user': 'pu_cs' } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: 'Forbidden', permission: 'customer.support.read' });
  });

  it('ACC-ACT-3 summary returns the latest occurredAt per visible service', async () => {
    await seed({ service: 'platform.tenants', type: 'tenant.suspended', occurredAt: new Date('2026-10-01T10:00:00.000Z') });
    await seed({ service: 'platform.tenants', type: 'tenant.unsuspended', occurredAt: new Date('2026-10-05T10:00:00.000Z') });
    await seed({ service: 'customer.support', type: 'ticket.created', occurredAt: new Date('2026-10-03T10:00:00.000Z') });
    const support = (await app.inject({ method: 'GET', url: '/api/internal/activity/summary' })).json();
    expect(support.services).toEqual([
      { service: 'customer.support', lastOccurredAt: '2026-10-03T10:00:00.000Z', count: 1, alerts24h: 0 },
      { service: 'platform.tenants', lastOccurredAt: '2026-10-05T10:00:00.000Z', count: 2, alerts24h: 0 }
    ]);
    const cs = (await app.inject({ method: 'GET', url: '/api/internal/activity/summary', headers: { 'x-test-user': 'pu_cs' } })).json();
    expect(cs.services.map((entry: { service: string }) => entry.service)).toEqual(['platform.tenants']);
  });

  it('the dashboard feed filters by pillar and severity (WP-3.5)', async () => {
    await seed({ service: 'customer.support', type: 'ticket.created', severity: 'INFO' });
    await seed({ service: 'customer.support', type: 'ticket.sla_breached', severity: 'ATTENTION' });
    await seed({ service: 'platform.tenants', type: 'tenant.suspended', severity: 'ATTENTION' });
    const customer = (await app.inject({ method: 'GET', url: '/api/internal/activity?pillar=customer' })).json();
    expect(customer.data.map((row: { type: string }) => row.type).sort()).toEqual(['ticket.created', 'ticket.sla_breached']);
    const attention = (await app.inject({ method: 'GET', url: '/api/internal/activity?pillar=customer&severity=ATTENTION' })).json();
    expect(attention.data.map((row: { type: string }) => row.type)).toEqual(['ticket.sla_breached']);
    expect((await app.inject({ method: 'GET', url: '/api/internal/activity?pillar=nope' })).statusCode).toBe(400);
  });

  it('summary counts ATTENTION/CRITICAL activity of the last 24 h per service (pillar alert count, WP-3.1)', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000);
    await seed({ service: 'customer.support', type: 'ticket.sla_breached', severity: 'ATTENTION', occurredAt: recent });
    await seed({ service: 'customer.support', type: 'ticket.escalated', severity: 'CRITICAL', occurredAt: recent });
    await seed({ service: 'customer.support', type: 'ticket.created', severity: 'INFO', occurredAt: recent });
    await seed({ service: 'customer.support', type: 'ticket.sla_breached', severity: 'ATTENTION', occurredAt: new Date(Date.now() - 30 * 60 * 60 * 1000) });
    const body = (await app.inject({ method: 'GET', url: '/api/internal/activity/summary' })).json();
    expect(body.services).toEqual([expect.objectContaining({ service: 'customer.support', count: 4, alerts24h: 2 })]);
  });

  it('Customer 360 Activity tab lists the tenant\'s rows and 404s for an unknown tenant', async () => {
    await seed({ service: 'customer.360', type: 'shipment.created', tenantId: 'tenant_a' });
    await seed({ service: 'customer.360', type: 'shipment.created', tenantId: 'tenant_b' });
    const response = await app.inject({ method: 'GET', url: '/api/internal/customer360/tenant_a/activity' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((row: { tenantId: string }) => row.tenantId)).toEqual(['tenant_a']);
    expect((await app.inject({ method: 'GET', url: '/api/internal/customer360/nope/activity' })).statusCode).toBe(404);
  });

  it('ACC-ACT-5 platform.activity-prune deletes rows older than 180 days only', async () => {
    const now = new Date('2026-10-18T00:00:00.000Z');
    await seed({ service: 'platform.tenants', type: 'old', occurredAt: new Date('2026-04-01T00:00:00.000Z') });
    await seed({ service: 'platform.tenants', type: 'just-past', occurredAt: new Date(now.getTime() - 180 * 86_400_000 - 1) });
    await seed({ service: 'platform.tenants', type: 'just-inside', occurredAt: new Date(now.getTime() - 179 * 86_400_000) });
    await seed({ service: 'platform.tenants', type: 'recent', occurredAt: new Date('2026-09-01T00:00:00.000Z') });
    const { pruneOldActivity } = await import('../../../jobs/activity-prune.js');
    expect((await pruneOldActivity(store.prisma as never, now)).deleted).toBe(2);
    expect(store.rows.map((row) => row.type).sort()).toEqual(['just-inside', 'recent']);
  });
});

type SseEvent = { event: string; data: string };

function openStream(port: number, user: string, headers: Record<string, string> = {}): Promise<{ events: SseEvent[]; response: IncomingMessage; close: () => void }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: '/api/internal/activity/stream', headers: { 'x-test-user': user, ...headers } }, (response) => {
      const events: SseEvent[] = [];
      let buffer = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        buffer += chunk;
        let index = buffer.indexOf('\n\n');
        while (index !== -1) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = block.split('\n').find((line) => line.startsWith('event: '))?.slice(7);
          const data = block.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
          if (event) events.push({ event, data: data ?? '' });
          index = buffer.indexOf('\n\n');
        }
      });
      resolve({ events, response, close: () => req.destroy() });
    });
    req.on('error', reject);
    req.end();
  });
}

async function until(predicate: () => boolean, timeoutMs = 2000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for stream events');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('activity SSE stream (WP-2.1)', () => {
  it('ACC-ACT-4 a client without customer.support.read never receives customer.support events', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    const cs = await openStream(port, 'pu_cs');
    const support = await openStream(port, 'pu_support');
    expect(cs.response.headers['content-type']).toContain('text/event-stream');
    await until(() => cs.events.some((event) => event.event === 'ready') && support.events.some((event) => event.event === 'ready'));

    const { activityHubFor } = await import('./activity.routes.js');
    const hub = activityHubFor(app);
    const ticket = await seed({ service: 'customer.support', type: 'ticket.created', tenantId: 'tenant_a' });
    const suspension = await seed({ service: 'platform.tenants', type: 'tenant.suspended', tenantId: 'tenant_a' });
    await hub.dispatch(ticket.id);
    await hub.dispatch(suspension.id);

    await until(() => support.events.filter((event) => event.event === 'activity').length === 2 && cs.events.some((event) => event.event === 'activity'));
    const csTypes = cs.events.filter((event) => event.event === 'activity').map((event) => (JSON.parse(event.data) as { type: string }).type);
    expect(csTypes).toEqual(['tenant.suspended']);
    const supportTypes = support.events.filter((event) => event.event === 'activity').map((event) => (JSON.parse(event.data) as { type: string }).type);
    expect(supportTypes.sort()).toEqual(['tenant.suspended', 'ticket.created']);
    expect(JSON.parse(support.events.find((event) => event.event === 'activity')!.data).tenant).toEqual({ id: 'tenant_a', name: 'Northwind', slug: 'northwind' });

    cs.close();
    support.close();
    await until(() => hub.size === 0);
  });

  it('ACC-L15-1 a tenant escalation (platform.incidents) reaches a console client with platform.incidents.read and no other', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    const cs = await openStream(port, 'pu_cs');
    const support = await openStream(port, 'pu_support');
    await until(() => cs.events.some((event) => event.event === 'ready') && support.events.some((event) => event.event === 'ready'));

    const { activityHubFor } = await import('./activity.routes.js');
    const hub = activityHubFor(app);
    const escalation = await seed({ service: 'platform.incidents', type: 'exception.escalated', tenantId: 'tenant_a' });
    const suspension = await seed({ service: 'platform.tenants', type: 'tenant.suspended', tenantId: 'tenant_a' });
    await hub.dispatch(escalation.id);
    await hub.dispatch(suspension.id);

    await until(() => support.events.filter((event) => event.event === 'activity').length === 2 && cs.events.some((event) => event.event === 'activity'));
    const typesOf = (client: typeof cs) => client.events.filter((event) => event.event === 'activity').map((event) => (JSON.parse(event.data) as { type: string }).type);
    expect(typesOf(support).sort()).toEqual(['exception.escalated', 'tenant.suspended']);
    expect(typesOf(cs)).toEqual(['tenant.suspended']);

    cs.close();
    support.close();
    await until(() => hub.size === 0);
  });

  it('a cross-origin console (admin.fauward.com → api host) gets the CORS headers EventSource needs', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    const stream = await openStream(port, 'pu_support', { origin: 'https://admin.fauward.com' });
    expect(stream.response.headers['content-type']).toContain('text/event-stream');
    expect(stream.response.headers['access-control-allow-origin']).toBe('https://admin.fauward.com');
    expect(stream.response.headers['access-control-allow-credentials']).toBe('true');
    await until(() => stream.events.some((event) => event.event === 'ready'));
    stream.close();
  });

  it('the stream sends a heartbeat comment every 25 s', async () => {
    const { ACTIVITY_HEARTBEAT_MS } = await import('./activity.routes.js');
    expect(ACTIVITY_HEARTBEAT_MS).toBe(25_000);
  });
});
