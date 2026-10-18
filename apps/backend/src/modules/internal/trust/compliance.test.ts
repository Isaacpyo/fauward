import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// trust.compliance (WP-2.5, L4) over an in-memory store with the real DSAR service, registry and Postgres storage
// adapter: tenant request → staff verify → gather job → review → deliver token → tenant download; erasure under and
// after a legal hold; the overdue sweep.

type Row = Record<string, unknown> & { id: string };
const queueAdd = vi.hoisted(() => vi.fn(async (_name: string, _data: Record<string, unknown>, _opts?: unknown) => ({ id: 'job' })));
const consoleSession = vi.hoisted(() => ({ mfaVerifiedAt: new Date() as Date | null }));
const tenantUser = vi.hoisted(() => ({ role: 'TENANT_ADMIN' }));

vi.mock('../../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd }, scheduledJobsQueue: { add: queueAdd }, bullmqConnection: {} }));
vi.mock('../../../queues/python-services.js', () => ({ publishPythonServiceJob: vi.fn(async () => undefined) }));
vi.mock('../internal-audit.js', () => ({ writeInternalAudit: vi.fn(async () => undefined) }));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({
    staff: null,
    roles: [],
    rolePermissions: new Set(['trust.compliance.dsar.read', 'trust.compliance.dsar.write', 'trust.compliance.dsar.deliver', 'trust.compliance.legal-hold.read', 'trust.compliance.legal-hold.write']),
    jit: new Map(),
    permissions: []
  }))
}));
vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_legal', email: 'lee@fauward.com', name: 'Lee Legal', role: 'PLATFORM_SUPPORT', status: 'ACTIVE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: consoleSession.mfaVerifiedAt } };
  }
}));
vi.mock('../../../shared/middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; tenant?: unknown }) => {
    request.user = { sub: 'u_admin', role: tenantUser.role, tenantId: 'tenant_a', email: 'admin@northwind.test' };
    request.tenant = { id: 'tenant_a', name: 'Northwind', slug: 'northwind' };
  }
}));

function compare(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
  if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
    const ops = condition as Record<string, unknown>;
    if ('equals' in ops) return ops.mode === 'insensitive' ? String(value).toLowerCase() === String(ops.equals).toLowerCase() : value === ops.equals;
    if ('in' in ops) return (ops.in as unknown[]).includes(value);
    if ('not' in ops) return ops.not === null ? value !== null && value !== undefined : value !== ops.not;
    if ('lt' in ops) return value instanceof Date && value < (ops.lt as Date);
    if ('gt' in ops) return value instanceof Date && value > (ops.gt as Date);
    return true; // relation filters (user: { tenantId }) are not modelled
  }
  return value === condition;
}

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Record<string, unknown>[]).some((part) => matches(row, part));
    if (key === 'AND') return (condition as Record<string, unknown>[]).every((part) => matches(row, part));
    return compare(row[key], condition);
  });
}

function table(rows: Row[], prefix: string, defaults: Record<string, unknown> = {}) {
  let seq = 0;
  const sorted = (list: Row[]) => [...list].sort((a, b) => ((b.createdAt as Date)?.getTime() ?? 0) - ((a.createdAt as Date)?.getTime() ?? 0));
  const first = async ({ where }: { where?: Record<string, unknown> }) => sorted(rows).find((row) => matches(row, where ?? {})) ?? null;
  return {
    create: vi.fn(async ({ data }: { data: Omit<Row, 'id'> & { id?: string } }) => {
      seq += 1;
      const row: Row = { createdAt: new Date(Date.now() + seq), updatedAt: new Date(), ...defaults, ...data, id: data.id ?? `${prefix}_${seq}` };
      rows.push(row);
      return { ...row };
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Omit<Row, 'id'> & { id?: string }> }) => {
      rows.push(...data.map((row, index) => ({ createdAt: new Date(), ...row, id: row.id ?? `${prefix}_m${rows.length + index}` })));
      return { count: data.length };
    }),
    findUnique: vi.fn(first),
    findFirst: vi.fn(first),
    findUniqueOrThrow: vi.fn(async (args: { where: Record<string, unknown> }) => (await first(args))!),
    findFirstOrThrow: vi.fn(async (args: { where: Record<string, unknown> }) => (await first(args))!),
    findMany: vi.fn(async ({ where, take }: { where?: Record<string, unknown>; take?: number } = {}) => sorted(rows).filter((row) => matches(row, where ?? {})).slice(0, take ?? 1000)),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
      const row = rows.find((item) => matches(item, where))!;
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hits = rows.filter((row) => matches(row, where));
      for (const row of hits) Object.assign(row, data);
      return { count: hits.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const keep = rows.filter((row) => !matches(row, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    })
  };
}

const ALICE = 'alice@example.com';

function createStore() {
  const t = (rows: Row[]) => rows;
  const data = {
    tenants: t([{ id: 'tenant_a', name: 'Northwind', slug: 'northwind', status: 'ACTIVE' }, { id: 'tenant_b', name: 'Southwind', slug: 'southwind', status: 'ACTIVE' }]),
    users: t([
      { id: 'u_admin', tenantId: 'tenant_a', email: 'admin@northwind.test', role: 'TENANT_ADMIN', isActive: true, firstName: 'Ada', lastName: 'Admin', phone: null },
      { id: 'u_alice', tenantId: 'tenant_a', email: ALICE, role: 'CUSTOMER', isActive: true, firstName: 'Alice', lastName: 'Ng', phone: '+447700900001', passwordHash: 'hash', mfaSecret: null, avatarUrl: null, ssoSubject: null, mfaEnabled: false },
      { id: 'u_bob', tenantId: 'tenant_a', email: 'bob@example.com', role: 'CUSTOMER', isActive: true, firstName: 'Bob', lastName: 'Ray', phone: '+447700900002' },
      { id: 'u_alice_b', tenantId: 'tenant_b', email: ALICE, role: 'CUSTOMER', isActive: true, firstName: 'Alice', lastName: 'Other', phone: '+447700900003' }
    ]),
    shipments: t([
      { id: 'sh_alice', tenantId: 'tenant_a', customerId: 'u_alice', trackingNumber: 'NW-1', status: 'DELIVERED', originAddress: { name: 'Alice Ng', phone: '+447700900001', line1: '1 High St', city: 'Leeds', postcode: 'LS1 1AA', country: 'GB' }, destinationAddress: { name: 'Carol', city: 'York', country: 'GB' }, notes: 'Leave with neighbour', specialInstructions: null },
      { id: 'sh_bob', tenantId: 'tenant_a', customerId: 'u_bob', trackingNumber: 'NW-2', status: 'DELIVERED', originAddress: { name: 'Bob Ray', city: 'Hull' }, destinationAddress: { name: 'Dan', city: 'York' }, notes: 'Bob note', specialInstructions: null },
      { id: 'sh_alice_b', tenantId: 'tenant_b', customerId: 'u_alice_b', trackingNumber: 'SW-1', status: 'DELIVERED', originAddress: { name: 'Alice Other', city: 'Bath' }, destinationAddress: { city: 'Bath' }, notes: 'other tenant', specialInstructions: null }
    ]),
    leads: t([
      { id: 'lead_a', tenantId: 'tenant_a', email: ALICE, contactName: 'Alice Ng', phone: '+447700900001', company: 'Alice Ltd', notes: 'called twice' },
      { id: 'lead_b', tenantId: 'tenant_b', email: ALICE, contactName: 'Alice Other', phone: '+447700900003', company: null, notes: 'other tenant' }
    ]),
    invoices: t([{ id: 'inv_alice', tenantId: 'tenant_a', customerId: 'u_alice', kind: 'TENANT_CUSTOMER', invoiceNumber: 'INV-1', status: 'PAID', total: '120.00', currency: 'GBP' }]),
    dsars: [] as Row[],
    transitions: [] as Row[],
    exports: [] as Row[],
    blobs: [] as Row[],
    holds: [] as Row[],
    activity: [] as Row[],
    inApp: [] as Row[],
    staffNotifications: [] as Row[]
  };
  const prisma: Record<string, unknown> = {
    tenant: table(data.tenants, 'tenant'),
    user: table(data.users, 'user'),
    shipment: table(data.shipments, 'sh'),
    lead: table(data.leads, 'lead'),
    invoice: table(data.invoices, 'inv'),
    supportTicket: table([], 'tkt'),
    ticketMessage: table([], 'msg'),
    returnRequest: table([], 'ret'),
    notificationLog: table([], 'log'),
    refreshToken: table([], 'rt'),
    inAppNotification: table(data.inApp, 'ian'),
    dSARRequest: table(data.dsars, 'dsar', { receivedAt: new Date(), identityVerifiedAt: null, erasureCompletedAt: null, overdueAt: null, closedAt: null, subjectUserId: null }),
    dSARTransition: table(data.transitions, 'tr'),
    complianceExport: table(data.exports, 'exp', { s3Key: null, downloadTokenHash: null, downloadedAt: null, expiresAt: null, error: null }),
    exportBlob: table(data.blobs, 'blob'),
    legalHold: table(data.holds, 'hold', { releasedBy: null, releasedAt: null, releaseReason: null }),
    platformAuditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async () => undefined) },
    platformActivity: {
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Row }) => {
        const existing = data.activity.find((row) => row.dedupeKey === where.dedupeKey);
        if (existing) return existing;
        const row = { ...create, id: `act_${data.activity.length + 1}` };
        data.activity.push(row);
        return row;
      })
    },
    staffUser: { findMany: vi.fn(async () => [{ platformUserId: 'pu_legal' }]) },
    staffNotification: { createMany: vi.fn(async ({ data: rows }: { data: Row[] }) => data.staffNotifications.push(...rows)) },
    platformUser: { findMany: vi.fn(async () => [{ id: 'pu_legal', email: 'lee@fauward.com' }]) }
  };
  prisma.$transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma));
  return { prisma, ...data };
}

let db: ReturnType<typeof createStore>;
let app: FastifyInstance;
const REASON = 'Verified against the signed request letter';

beforeEach(async () => {
  queueAdd.mockClear();
  consoleSession.mfaVerifiedAt = new Date();
  tenantUser.role = 'TENANT_ADMIN';
  db = createStore();
  app = Fastify();
  app.decorate('prisma', db.prisma as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  const { registerConsoleComplianceRoutes } = await import('./compliance.routes.js');
  const { registerDsarRoutes } = await import('../../dsar/dsar.routes.js');
  await registerConsoleComplianceRoutes(app);
  await registerDsarRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

async function fileRequest(requestType: string) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/dsar', payload: { requestType, subjectEmail: 'Alice@Example.com', relation: 'CUSTOMER', description: 'Customer asked for everything we hold about her.' } });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

async function verifyAndGather(id: string) {
  expect((await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/verify-identity`, payload: { notes: 'Matched the account email and a recent order' } })).statusCode).toBe(200);
  const gather = await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/gather`, payload: {} });
  expect(gather.statusCode).toBe(202);
  const [name, jobData] = queueAdd.mock.calls.at(-1)!;
  expect(name).toBe('trust.dsar-gather');
  const { gatherDsar } = await import('../../../services/dsar.service.js');
  const result = await gatherDsar(app, jobData as { dsarId: string; exportId: string });
  expect(result.status).toBe('READY');
  return gather.json().export.id as string;
}

function tokenFromLink(link: string) {
  return new URL(link, 'https://tenant.example').searchParams.get('token')!;
}

describe('trust.compliance (WP-2.5)', () => {
  it('ACC-DSAR-1 a tenant admin can request ERASURE; staff are told and the request is queued with a due date', async () => {
    const id = await fileRequest('ERASURE');
    expect(db.dsars[0]).toMatchObject({ id, tenantId: 'tenant_a', requestType: 'ERASURE', requesterEmail: ALICE, status: 'RECEIVED' });
    expect((db.dsars[0].dueAt as Date).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect(db.activity).toEqual([expect.objectContaining({ type: 'dsar.requested', severity: 'ATTENTION', tenantId: 'tenant_a' })]);
    expect(db.staffNotifications).toEqual([expect.objectContaining({ platformUserId: 'pu_legal', event: 'dsar.requested' })]);
    const list = await app.inject({ method: 'GET', url: '/api/internal/compliance/dsar?status=OPEN' });
    expect(list.json().data).toEqual([expect.objectContaining({ id, requestType: 'ERASURE', subjectEmail: ALICE, overdue: false, tenant: expect.objectContaining({ name: 'Northwind' }) })]);
    expect((await app.inject({ method: 'POST', url: '/api/v1/tenants/me/dsar', payload: { requestType: 'DELETE_EVERYTHING', subjectEmail: ALICE, description: 'not a real request type' } })).statusCode).toBe(400);
  });

  it('ACC-DSAR-2 ACC-L4-1 ACCESS round trip: the bundle holds exactly the subject’s rows and the tenant downloads it once', async () => {
    const id = await fileRequest('ACCESS');
    expect((await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/approve`, payload: {} })).statusCode).toBe(409);
    await verifyAndGather(id);
    expect(db.exports[0]).toMatchObject({ status: 'READY', storageProvider: 'POSTGRES' });
    expect(db.blobs[0]).toMatchObject({ tenantId: 'tenant_a' });
    const bundle = JSON.parse((db.blobs[0].bytes as Buffer).toString('utf8'));
    expect(bundle.subject).toEqual({ email: ALICE, userId: 'u_alice' });
    expect(bundle.records.User.map((row: Row) => row.id)).toEqual(['u_alice']);
    expect(bundle.records.Shipment.map((row: Row) => row.id)).toEqual(['sh_alice']);
    expect(bundle.records.Lead.map((row: Row) => row.id)).toEqual(['lead_a']);
    expect(bundle.records.Invoice.map((row: Row) => row.id)).toEqual(['inv_alice']);
    expect(JSON.stringify(bundle)).not.toMatch(/Bob|Southwind|Alice Other|other tenant/);

    expect((await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/approve`, payload: { notes: 'Bundle reviewed, nothing to withhold' } })).statusCode).toBe(200);
    const delivered = await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/deliver`, payload: { reason: REASON } });
    expect(delivered.statusCode).toBe(200);
    expect(delivered.body).not.toContain('token=');
    const notice = db.inApp.find((row) => row.type === 'dsar.ready')!;
    expect(notice).toMatchObject({ userId: 'u_admin', tenantId: 'tenant_a' });
    expect(queueAdd.mock.calls.some(([, job]) => job.template === 'dsar_ready')).toBe(true);
    const token = tokenFromLink(String(notice.link));
    expect(db.exports[0].downloadTokenHash).not.toBe(token);

    const list = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/dsar' });
    expect(list.json().requests[0]).toMatchObject({ id, statusLabel: 'Ready to download', download: { available: true } });
    const download = await app.inject({ method: 'GET', url: `/api/v1/tenants/me/dsar/${id}/download?token=${encodeURIComponent(token)}` });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-disposition']).toContain(`dsar-${id}.json`);
    expect(JSON.parse(download.body).records.Shipment).toHaveLength(1);
    expect(db.activity.map((row) => row.type)).toEqual(expect.arrayContaining(['dsar.requested', 'dsar.gathered', 'dsar.delivered', 'dsar.downloaded']));
    expect((await app.inject({ method: 'GET', url: `/api/v1/tenants/me/dsar/${id}/download?token=${encodeURIComponent(token)}` })).statusCode).toBe(403);
  });

  it('ACC-DSAR-3 the download needs a tenant admin session and the token; an expired token is refused', async () => {
    const id = await fileRequest('PORTABILITY');
    await verifyAndGather(id);
    await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/approve`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/deliver`, payload: { reason: REASON } });
    const token = tokenFromLink(String(db.inApp.find((row) => row.type === 'dsar.ready')!.link));

    expect((await app.inject({ method: 'GET', url: `/api/v1/tenants/me/dsar/${id}/download` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/v1/tenants/me/dsar/${id}/download?token=${'x'.repeat(43)}` })).statusCode).toBe(403);
    tenantUser.role = 'TENANT_MANAGER';
    expect((await app.inject({ method: 'GET', url: `/api/v1/tenants/me/dsar/${id}/download?token=${encodeURIComponent(token)}` })).statusCode).toBe(403);
    tenantUser.role = 'TENANT_ADMIN';
    db.exports[0].expiresAt = new Date(Date.now() - 1000);
    expect((await app.inject({ method: 'GET', url: `/api/v1/tenants/me/dsar/${id}/download?token=${encodeURIComponent(token)}` })).statusCode).toBe(410);
    // Another tenant's request with the same token shape is never found: the lookup is scoped to the caller's tenant.
    db.exports[0].tenantId = 'tenant_b';
    db.exports[0].expiresAt = new Date(Date.now() + 60_000);
    expect((await app.inject({ method: 'GET', url: `/api/v1/tenants/me/dsar/${id}/download?token=${encodeURIComponent(token)}` })).statusCode).toBe(403);
  });

  it('ACC-DSAR-4 ACC-DSAR-6 ACC-L4-2 erasure is blocked by a hold, unblocked by its release, then anonymises only the subject', async () => {
    const id = await fileRequest('ERASURE');
    await verifyAndGather(id);
    const hold = await app.inject({ method: 'POST', url: '/api/internal/compliance/legal-holds', payload: { tenantId: 'tenant_a', reason: 'Litigation 2026-17 preservation notice' } });
    expect(hold.statusCode).toBe(201);
    const holdId = hold.json().hold.id as string;

    const blocked = await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/erase`, payload: { reason: REASON } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: 'LEGAL_HOLD_ACTIVE', holdId });

    const released = await app.inject({ method: 'POST', url: `/api/internal/compliance/legal-holds/${holdId}/release`, payload: { reason: 'Case settled, preservation lifted' } });
    expect(released.statusCode).toBe(200);
    expect(db.holds[0]).toMatchObject({ status: 'RELEASED', releasedBy: 'pu_legal', releaseReason: 'Case settled, preservation lifted' });
    expect(db.holds[0].releasedAt).toBeInstanceOf(Date);
    expect((await app.inject({ method: 'POST', url: `/api/internal/compliance/legal-holds/${holdId}/release`, payload: { reason: 'Case settled, preservation lifted' } })).statusCode).toBe(409);

    const erase = await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/erase`, payload: { reason: REASON } });
    expect(erase.statusCode).toBe(202);
    const [name, jobData] = queueAdd.mock.calls.at(-1)!;
    expect(name).toBe('trust.dsar-erase');
    const { eraseDsar } = await import('../../../services/dsar.service.js');
    expect((await eraseDsar(app, jobData as { dsarId: string; tenantId: string })).status).toBe('ERASED');

    const alice = db.users.find((row) => row.id === 'u_alice')!;
    expect(alice).toMatchObject({ email: 'erased-u_alice@erased.invalid', firstName: null, lastName: null, phone: null, passwordHash: null, isActive: false });
    expect(db.shipments.find((row) => row.id === 'sh_alice')).toMatchObject({ originAddress: { city: 'Leeds', postcode: 'LS1 1AA', country: 'GB' }, notes: null });
    expect(db.leads.find((row) => row.id === 'lead_a')).toMatchObject({ email: null, contactName: null, phone: null, notes: null });
    expect(db.invoices[0]).toMatchObject({ customerId: 'u_alice', total: '120.00' });
    // Untouched: another subject in the same tenant, and the same email in another tenant.
    expect(db.users.find((row) => row.id === 'u_bob')).toMatchObject({ email: 'bob@example.com', firstName: 'Bob' });
    expect(db.users.find((row) => row.id === 'u_alice_b')).toMatchObject({ email: ALICE, firstName: 'Alice' });
    expect(db.shipments.find((row) => row.id === 'sh_alice_b')).toMatchObject({ notes: 'other tenant' });
    expect(db.leads.find((row) => row.id === 'lead_b')).toMatchObject({ email: ALICE });
    // The gathered bundle held the erased data and is gone.
    expect(db.blobs).toHaveLength(0);
    expect(db.dsars[0]).toMatchObject({ status: 'ERASED' });
    expect(db.dsars[0].erasureCompletedAt).toBeInstanceOf(Date);
    expect(db.inApp.map((row) => row.type)).toContain('dsar.erased');
    expect(queueAdd.mock.calls.some(([, job]) => job.template === 'dsar_completed_erasure')).toBe(true);
    expect(db.activity.map((row) => row.type)).toEqual(expect.arrayContaining(['legal_hold.created', 'legal_hold.released', 'dsar.erased']));
  });

  it('ACC-DSAR-4 a hold placed after the erase was queued stops the job before anything changes', async () => {
    const id = await fileRequest('ERASURE');
    await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/verify-identity`, payload: {} });
    expect((await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/erase`, payload: { reason: REASON } })).statusCode).toBe(202);
    await app.inject({ method: 'POST', url: '/api/internal/compliance/legal-holds', payload: { tenantId: 'tenant_a', reason: 'Regulator information request' } });
    const { eraseDsar } = await import('../../../services/dsar.service.js');
    expect((await eraseDsar(app, { dsarId: id, tenantId: 'tenant_a' })).status).toBe('BLOCKED');
    expect(db.users.find((row) => row.id === 'u_alice')).toMatchObject({ email: ALICE });
    expect(db.dsars[0]).toMatchObject({ status: 'APPROVED' });
  });

  it('ACC-DSAR-5 an overdue request raises one ATTENTION activity and one staff notification', async () => {
    const id = await fileRequest('ACCESS');
    db.dsars[0].dueAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    db.activity.length = 0;
    db.staffNotifications.length = 0;
    const { sweepOverdueDsars } = await import('../../../services/dsar.service.js');
    expect(await sweepOverdueDsars(app)).toEqual({ checked: 1, flagged: 1 });
    expect(await sweepOverdueDsars(app)).toEqual({ checked: 0, flagged: 0 });
    expect(db.activity).toEqual([expect.objectContaining({ type: 'dsar.overdue', severity: 'ATTENTION', subjectId: id })]);
    expect(db.staffNotifications).toEqual([expect.objectContaining({ event: 'dsar.overdue', severity: 'ATTENTION' })]);
    const list = await app.inject({ method: 'GET', url: '/api/internal/compliance/dsar?overdue=true' });
    expect(list.json().data).toEqual([expect.objectContaining({ id, overdue: true })]);
  });

  it('delivery and erasure are dangerous: stale MFA → 403, no reason → 400; ERASURE is never delivered', async () => {
    const id = await fileRequest('ERASURE');
    expect((await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/deliver`, payload: {} })).json()).toMatchObject({ error: 'REASON_REQUIRED' });
    expect((await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/deliver`, payload: { reason: REASON } })).json()).toMatchObject({ error: 'ERASURE_NOT_DELIVERED' });
    consoleSession.mfaVerifiedAt = new Date(Date.now() - 60 * 60 * 1000);
    const stale = await app.inject({ method: 'POST', url: `/api/internal/compliance/dsar/${id}/erase`, payload: { reason: REASON } });
    expect(stale.statusCode).toBe(403);
    expect(stale.json()).toMatchObject({ error: 'MFA_REQUIRED' });
  });
});
