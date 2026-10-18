import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// trust.audit (WP-1.9). The routes run against an in-memory platformAuditLog that evaluates the Prisma where/orderBy/cursor
// the handler builds, and the export writes its audit row through the real @fauward/internal-audit writer.

const permissions = new Set<string>();
const mfa = { verifiedAt: new Date() as Date | null };

vi.mock('../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: 'pu_auditor', email: 'auditor@fauward.com', name: null, role: 'PLATFORM_SUPPORT', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_auditor', mfaVerifiedAt: mfa.verifiedAt }
    };
  }
}));
vi.mock('../../middleware/require-console-permission.js', () => ({
  requireConsolePermission: (permission: string) => async (_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    if (!permissions.has(permission)) return reply.status(403).send({ error: 'Forbidden', permission });
    return undefined;
  }
}));

type Row = Record<string, unknown> & { id: string; createdAt: Date };
type Where = Record<string, unknown>;

function fieldMatches(value: unknown, condition: unknown): boolean {
  if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
    const ops = condition as { contains?: string; mode?: string; gte?: Date; lte?: Date };
    if (ops.contains !== undefined) return typeof value === 'string' && value.toLowerCase().includes(ops.contains.toLowerCase());
    if (ops.gte && !(value instanceof Date && value >= ops.gte)) return false;
    if (ops.lte && !(value instanceof Date && value <= ops.lte)) return false;
    return true;
  }
  return value === condition;
}

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Where[]).every((part) => matches(row, part));
    if (key === 'OR') return (condition as Where[]).some((part) => matches(row, part));
    return fieldMatches(row[key], condition);
  });
}

function sortRows(rows: Row[], orderBy: Array<Record<string, 'asc' | 'desc'>>) {
  return [...rows].sort((a, b) => {
    for (const order of orderBy) {
      const [key, direction] = Object.entries(order)[0];
      const left = a[key] instanceof Date ? (a[key] as Date).getTime() : String(a[key]);
      const right = b[key] instanceof Date ? (b[key] as Date).getTime() : String(b[key]);
      if (left < right) return direction === 'asc' ? -1 : 1;
      if (left > right) return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

function createStore() {
  const rows: Row[] = [];
  const base = Date.parse('2026-10-01T00:00:00.000Z');
  const add = (index: number, data: Partial<Row>) => {
    rows.push({
      id: `aud_${String(index).padStart(3, '0')}`,
      actorType: 'PLATFORM_USER',
      actorId: 'pu_support',
      actorEmail: 'support@fauward.com',
      actorRole: 'PLATFORM_SUPPORT',
      action: 'tenant.view',
      targetType: 'tenant',
      targetId: 't_other',
      targetTenantId: 't_other',
      targetUserId: null,
      reason: null,
      metadata: {},
      previousHash: null,
      hash: `h_${index}`,
      createdAt: new Date(base + index * 60_000),
      ...data
    });
  };
  const platformAuditLog = {
    findMany: vi.fn(async (args: { where?: Where; orderBy: Array<Record<string, 'asc' | 'desc'>>; take?: number; cursor?: { id: string }; skip?: number }) => {
      let list = sortRows(rows.filter((row) => matches(row, args.where)), args.orderBy);
      if (args.cursor) list = list.slice(list.findIndex((row) => row.id === args.cursor!.id) + (args.skip ?? 0));
      return list.slice(0, args.take ?? list.length).map((row) => ({ ...row }));
    }),
    count: vi.fn(async ({ where }: { where?: Where }) => rows.filter((row) => matches(row, where)).length),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null),
    findFirst: vi.fn(async () => {
      const [latest] = sortRows(rows, [{ createdAt: 'desc' }]);
      return latest ? { hash: latest.hash } : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: Row = { id: `aud_new_${rows.length}`, createdAt: new Date(), ...data };
      rows.push(row);
      return row;
    })
  };
  const tenant = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      [{ id: 't_acme', name: 'Acme Freight', slug: 'acme' }].filter((row) => where.id.in.includes(row.id))
    )
  };
  return { rows, add, prisma: { platformAuditLog, tenant } };
}

let store: ReturnType<typeof createStore>;
let app: FastifyInstance;

async function buildApp() {
  const { registerInternalAuditRoutes } = await import('./audit.routes.js');
  const instance = Fastify();
  instance.decorate('prisma', store.prisma as never);
  await registerInternalAuditRoutes(instance);
  await instance.ready();
  return instance;
}

const list = (query: Record<string, string>) => app.inject({ method: 'GET', url: `/api/internal/audit/entries?${new URLSearchParams(query).toString()}` });
type ListBody = { data: Row[]; total: number; nextCursor: string | null };

describe('trust.audit routes (WP-1.9)', () => {
  beforeEach(async () => {
    permissions.clear();
    permissions.add('trust.audit.read');
    mfa.verifiedAt = new Date();
    store = createStore();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('ACC-AUD-2 cursor pagination walks past the first 50 entries without gaps or repeats', async () => {
    for (let index = 0; index < 120; index += 1) store.add(index, {});
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response = await list({ limit: '50', ...(cursor ? { cursor } : {}) });
      expect(response.statusCode).toBe(200);
      const body = response.json<ListBody>();
      expect(body.total).toBe(120);
      seen.push(...body.data.map((row) => row.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    expect(seen[0]).toBe('aud_119');
    expect(seen[119]).toBe('aud_000');
    expect((await list({ limit: '500' })).statusCode).toBe(400);
  });

  it('ACC-AUD-3 actor, action, tenant, target and date filters combine with AND; free text matches any column', async () => {
    store.add(1, { actorEmail: 'ops@fauward.com', action: 'tenant.suspend', targetTenantId: 't_acme', targetId: 't_acme', createdAt: new Date('2026-10-05T10:00:00.000Z') });
    store.add(2, { actorEmail: 'ops@fauward.com', action: 'tenant.suspend', targetTenantId: 't_acme', targetId: 't_acme', createdAt: new Date('2026-10-09T10:00:00.000Z') });
    store.add(3, { actorEmail: 'ops@fauward.com', action: 'tenant.suspend', targetTenantId: 't_beta', targetId: 't_beta', createdAt: new Date('2026-10-05T11:00:00.000Z') });
    store.add(4, { actorEmail: 'finance@fauward.com', action: 'tenant.suspend', targetTenantId: 't_acme', targetId: 't_acme', createdAt: new Date('2026-10-05T12:00:00.000Z') });
    store.add(5, { actorEmail: 'ops@fauward.com', action: 'billing.refund.approve', targetType: 'refund', targetId: 'rf_9', targetTenantId: 't_acme', reason: 'Duplicate charge', createdAt: new Date('2026-10-05T13:00:00.000Z') });

    const ids = async (query: Record<string, string>) => (await list(query)).json<ListBody>().data.map((row) => row.id).sort();

    expect(await ids({ actor: 'OPS@', action: 'suspend', tenantId: 't_acme' })).toEqual(['aud_001', 'aud_002']);
    const chips = (await list({ tenantId: 't_acme', limit: '1' })).json<{ data: Array<{ targetTenant: unknown }> }>().data;
    expect(chips[0].targetTenant).toEqual({ id: 't_acme', name: 'Acme Freight', slug: 'acme' });
    expect(await ids({ actor: 'ops@', action: 'suspend', tenantId: 't_acme', from: '2026-10-05T00:00:00.000Z', to: '2026-10-06T00:00:00.000Z' })).toEqual(['aud_001']);
    expect(await ids({ targetType: 'refund', targetId: 'rf_' })).toEqual(['aud_005']);
    expect(await ids({ q: 'duplicate', actor: 'ops@' })).toEqual(['aud_005']);
    expect(await ids({ q: 'duplicate', actor: 'finance@' })).toEqual([]);
    expect(await ids({ actor: 'pu_support' })).toEqual(['aud_001', 'aud_002', 'aud_003', 'aud_004', 'aud_005']);
    expect((await list({ from: 'yesterday' })).statusCode).toBe(400);
  });

  it('ACC-AUD-4 export returns the filtered set and writes its own audit row (after the read)', async () => {
    permissions.add('trust.audit.export');
    store.add(1, { action: 'tenant.suspend', targetTenantId: 't_acme', reason: 'Fraud "signal"' });
    store.add(2, { action: 'tenant.suspend', targetTenantId: 't_beta' });
    store.add(3, { action: 'tenant.view', targetTenantId: 't_acme' });

    const response = await app.inject({ method: 'POST', url: '/api/internal/audit/export', payload: { action: 'suspend', format: 'csv', reason: 'SOC 2 evidence for Q4' } });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ url: string; rows: number; truncated: boolean; format: string }>();
    expect(body).toMatchObject({ rows: 2, truncated: false, format: 'csv' });
    const csv = Buffer.from(body.url.replace('data:text/csv;base64,', ''), 'base64').toString('utf8');
    const lines = csv.split('\n');
    expect(lines[0].split(',').slice(0, 2)).toEqual(['id', 'createdAt']);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"aud_001"');
    expect(lines[1]).toContain('"Fraud ""signal"""');
    expect(lines[2]).toContain('"aud_002"');

    const exportRow = store.rows.find((row) => row.action === 'audit.export');
    expect(exportRow).toMatchObject({ actorId: 'pu_auditor', actorEmail: 'auditor@fauward.com', targetType: 'audit_log', reason: 'SOC 2 evidence for Q4', sessionId: 'ps_auditor' });
    expect(JSON.stringify(exportRow?.after ?? exportRow?.metadata)).toContain('"rows":2');

    const json = await app.inject({ method: 'POST', url: '/api/internal/audit/export', payload: { tenantId: 't_acme', reason: 'SOC 2 evidence for Q4' } });
    const exported = JSON.parse(Buffer.from(json.json<{ url: string }>().url.replace('data:application/json;base64,', ''), 'base64').toString('utf8')) as Row[];
    expect(exported.map((row) => row.id)).toEqual(['aud_001', 'aud_003']);
  });

  it('ACC-AUD-4 export is a dangerous action: permission, fresh MFA and a reason', async () => {
    const denied = await app.inject({ method: 'POST', url: '/api/internal/audit/export', payload: { reason: 'SOC 2 evidence for Q4' } });
    expect(denied.statusCode).toBe(403);
    permissions.add('trust.audit.export');
    expect((await app.inject({ method: 'POST', url: '/api/internal/audit/export', payload: { reason: 'short' } })).json()).toMatchObject({ error: 'REASON_REQUIRED' });
    mfa.verifiedAt = null;
    expect((await app.inject({ method: 'POST', url: '/api/internal/audit/export', payload: { reason: 'SOC 2 evidence for Q4' } })).json()).toMatchObject({ error: 'MFA_REQUIRED' });
    expect(store.rows.some((row) => row.action === 'audit.export')).toBe(false);
  });

  it('entry detail returns before/after and 404s for unknown ids', async () => {
    store.add(1, { before: { status: 'ACTIVE' }, after: { status: 'SUSPENDED' } });
    expect((await app.inject({ method: 'GET', url: '/api/internal/audit/entries/aud_001' })).json()).toMatchObject({ before: { status: 'ACTIVE' }, after: { status: 'SUSPENDED' } });
    expect((await app.inject({ method: 'GET', url: '/api/internal/audit/entries/missing' })).statusCode).toBe(404);
  });
});
