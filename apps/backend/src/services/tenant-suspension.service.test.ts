import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../modules/notifications/notifications.service.js', () => ({ sendEmail: sendEmailMock }));

const { liftSuspension, suspendTenant, SuspensionError } = await import('./tenant-suspension.service.js');
const { handleDunningEvent, handleDunningPaid } = await import('../modules/payments/billing.service.js');

type Row = Record<string, unknown> & { id: string };

/** In-memory Prisma double with just the semantics the suspension service relies on. */
function createWorld(tenantOverrides: Record<string, unknown> = {}) {
  let seq = 0;
  const tick = () => new Date(Date.UTC(2026, 9, 18, 12, 0, seq++));
  const tenants = new Map<string, Row>([['t_1', { id: 't_1', name: 'Northwind', status: 'ACTIVE', suspendedAt: null, suspensionReason: null, updatedAt: new Date('2026-10-01T00:00:00Z'), ...tenantOverrides }]]);
  const records: Row[] = [];
  const users: Row[] = [
    { id: 'u_admin_1', tenantId: 't_1', email: 'a1@northwind.test', role: 'TENANT_ADMIN', isActive: true },
    { id: 'u_admin_2', tenantId: 't_1', email: 'a2@northwind.test', role: 'TENANT_ADMIN', isActive: true },
    { id: 'u_admin_old', tenantId: 't_1', email: 'old@northwind.test', role: 'TENANT_ADMIN', isActive: false },
    { id: 'u_staff', tenantId: 't_1', email: 'ops@northwind.test', role: 'TENANT_STAFF', isActive: true },
    { id: 'u_other', tenantId: 't_2', email: 'x@other.test', role: 'TENANT_ADMIN', isActive: true }
  ];
  const inApp: Row[] = [];
  const audit: Row[] = [];
  const activity: Row[] = [];

  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && !(value instanceof Date) && 'in' in (value as object)) return ((value as { in: unknown[] }).in).includes(row[key]);
      return row[key] === value;
    });
  const byNewest = (a: Row, b: Row) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime();

  const prisma = {
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => tenants.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(tenants.get(where.id)!, data))
    },
    suspensionRecord: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => records.filter((row) => matches(row, where)).sort(byNewest)[0] ?? null),
      findMany: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { createdAt: 'asc' | 'desc' } }) => {
        const found = records.filter((row) => matches(row, where)).sort(byNewest);
        return orderBy?.createdAt === 'asc' ? found.reverse() : found;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: `susp_${records.length + 1}`, createdAt: tick(), liftedAt: null, liftedBy: null, liftedVia: null, liftReason: null, ...data };
        records.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = records.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      })
    },
    platformAuditLog: {
      findFirst: vi.fn(async () => audit.at(-1) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `audit_${audit.length + 1}`, ...data };
        audit.push(row);
        return row;
      })
    },
    platformActivity: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
        const existing = activity.find((row) => row.dedupeKey === create.dedupeKey);
        if (existing) return existing;
        const row = { id: `act_${activity.length + 1}`, ...create };
        activity.push(row);
        return row;
      })
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => users.filter((row) => matches(row, where)).map((row) => ({ id: row.id, email: row.email })))
    },
    inAppNotification: { createMany: vi.fn(async ({ data }: { data: Row[] }) => inApp.push(...data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma))
  };
  const app = {
    prisma,
    redis: { publish: vi.fn(async () => 1), del: vi.fn(async () => 1) },
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
  };
  return { app: app as never, prisma, tenants, records, inApp, audit, activity, redis: app.redis };
}

const staff = { type: 'STAFF' as const, platformUserId: 'pu_1', email: 'trust@fauward.com', label: 'Trust Analyst' };

beforeEach(() => {
  sendEmailMock.mockClear();
});

describe('TenantSuspensionService (D3)', () => {
  it('ACC-SUS-1 platform suspend creates an ACTIVE PLATFORM record, sets status/suspendedAt/suspensionReason, audits and notifies admins', async () => {
    const world = createWorld();
    const result = await suspendTenant(world.app, { tenantId: 't_1', source: 'PLATFORM', category: 'AUP', reason: 'Spam campaigns reported by carriers', publicReason: 'Your workspace sent bulk unsolicited messages.', actor: staff });

    expect(result.record).toMatchObject({ status: 'ACTIVE', source: 'PLATFORM', category: 'AUP', reason: 'Spam campaigns reported by carriers', publicReason: 'Your workspace sent bulk unsolicited messages.', suspendedBy: 'pu_1' });
    const tenant = world.tenants.get('t_1')!;
    expect(tenant.status).toBe('SUSPENDED');
    expect(tenant.suspendedAt).toBeInstanceOf(Date);
    expect(tenant.suspensionReason).toBe('Your workspace sent bulk unsolicited messages.');
    expect(world.audit).toEqual([expect.objectContaining({ action: 'TENANT_SUSPENSION', actorType: 'PLATFORM_USER', actorId: 'pu_1', targetTenantId: 't_1', reason: 'Spam campaigns reported by carriers' })]);
    expect(world.inApp.map((row) => row.userId).sort()).toEqual(['u_admin_1', 'u_admin_2']);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ template: 'tenant_suspended', to: 'a1@northwind.test' }));
    expect(world.redis.publish).toHaveBeenCalledWith('tenant:t_1:status-changed', expect.any(String));
  });

  it('ACC-FND-1 a tenant suspension writes exactly one activity row and one in-app notification per active TENANT_ADMIN', async () => {
    const world = createWorld();
    await suspendTenant(world.app, { tenantId: 't_1', source: 'PLATFORM', category: 'OTHER', reason: 'Owner requested a pause', actor: staff });
    expect(world.activity).toHaveLength(1);
    expect(world.activity[0]).toMatchObject({ service: 'platform.tenants', type: 'tenant.suspended', tenantId: 't_1', actorType: 'STAFF', severity: 'CRITICAL' });
    expect(world.inApp).toHaveLength(2);
    expect(new Set(world.inApp.map((row) => row.userId)).size).toBe(2);
    expect(world.inApp.every((row) => row.tenantId === 't_1' && row.type === 'tenant.suspended')).toBe(true);
  });

  it('the tenant never sees the internal reason; without a public reason it gets the category text', async () => {
    const world = createWorld();
    await suspendTenant(world.app, { tenantId: 't_1', source: 'FRAUD', category: 'FRAUD', reason: 'Stolen cards linked to account', actor: staff, sourceRef: 'sig_1' });
    expect(world.tenants.get('t_1')!.suspensionReason).toBe('Your workspace is suspended while Fauward reviews account activity.');
    expect(JSON.stringify(world.inApp)).not.toContain('Stolen cards');
  });

  it('ACC-SUS-3 two active causes: lifting one leaves the tenant SUSPENDED; lifting both makes it ACTIVE', async () => {
    const world = createWorld();
    const billing = await suspendTenant(world.app, { tenantId: 't_1', source: 'DUNNING', category: 'BILLING', reason: 'Card declined twice', actor: { type: 'SYSTEM', label: 'Stripe billing' }, sourceRef: 'in_1' });
    const fraud = await suspendTenant(world.app, { tenantId: 't_1', source: 'FRAUD', category: 'FRAUD', reason: 'Radar early fraud warning', actor: staff, sourceRef: 'sig_9' });
    expect(world.records.filter((row) => row.status === 'ACTIVE')).toHaveLength(2);
    // The second cause does not notify again; the tenant was already suspended.
    expect(world.inApp).toHaveLength(2);

    const first = await liftSuspension(world.app, { tenantId: 't_1', suspensionId: fraud.record.id, via: 'MANUAL', reason: 'False positive confirmed', actor: staff });
    expect(first.becameActive).toBe(false);
    expect(world.tenants.get('t_1')!.status).toBe('SUSPENDED');
    expect(world.tenants.get('t_1')!.suspensionReason).toBe(billing.record.publicReason);
    expect(world.records.find((row) => row.id === fraud.record.id)).toMatchObject({ status: 'LIFTED', liftedVia: 'MANUAL', liftReason: 'False positive confirmed', liftedBy: 'pu_1' });

    const second = await liftSuspension(world.app, { tenantId: 't_1', suspensionId: billing.record.id, via: 'PAYMENT', reason: 'Invoice paid', actor: staff });
    expect(second.becameActive).toBe(true);
    expect(world.tenants.get('t_1')).toMatchObject({ status: 'ACTIVE', suspendedAt: null, suspensionReason: null });
    expect(world.inApp.filter((row) => row.type === 'tenant.unsuspended')).toHaveLength(2);
  });

  it('ACC-SUS-2 Stripe attempt 2 opens a DUNNING cause for the invoice once; invoice.paid for that invoice lifts it via PAYMENT', async () => {
    const world = createWorld();
    await handleDunningEvent(world.app, { tenantId: 't_1', attempt: 2, invoiceRef: 'in_stripe_1' });
    await handleDunningEvent(world.app, { tenantId: 't_1', attempt: 2, invoiceRef: 'in_stripe_1' }); // webhook retry
    expect(world.records).toHaveLength(1);
    expect(world.records[0]).toMatchObject({ source: 'DUNNING', category: 'BILLING', sourceRef: 'in_stripe_1', status: 'ACTIVE', suspendedBy: 'system' });
    expect(world.tenants.get('t_1')!.status).toBe('SUSPENDED');

    expect(await handleDunningPaid(world.app, { tenantId: 't_1', invoiceRef: 'in_other' })).toBeNull();
    expect(world.tenants.get('t_1')!.status).toBe('SUSPENDED');

    await handleDunningPaid(world.app, { tenantId: 't_1', invoiceRef: 'in_stripe_1' });
    expect(world.records[0]).toMatchObject({ status: 'LIFTED', liftedVia: 'PAYMENT' });
    expect(world.tenants.get('t_1')!.status).toBe('ACTIVE');
  });

  it('a closed (CANCELLED) tenant records the lift but is never reactivated', async () => {
    const world = createWorld({ status: 'CANCELLED' });
    const closure = await suspendTenant(world.app, { tenantId: 't_1', source: 'PLATFORM', category: 'OTHER', reason: 'Tenant closed', actor: staff });
    expect(world.tenants.get('t_1')!.status).toBe('CANCELLED');
    const lifted = await liftSuspension(world.app, { tenantId: 't_1', suspensionId: closure.record.id, via: 'APPEAL', reason: 'Appeal approved', actor: staff });
    expect(lifted.becameActive).toBe(false);
    expect(world.tenants.get('t_1')!.status).toBe('CANCELLED');
    expect(world.records[0].status).toBe('LIFTED');
  });

  it('lifting an unknown or already lifted cause fails with a typed error; lifting all needs an active cause', async () => {
    const world = createWorld();
    await expect(liftSuspension(world.app, { tenantId: 't_1', suspensionId: 'nope', via: 'MANUAL', reason: 'x', actor: staff })).rejects.toMatchObject({ code: 'SUSPENSION_NOT_FOUND', statusCode: 404 });
    await expect(liftSuspension(world.app, { tenantId: 't_1', via: 'MANUAL', reason: 'x', actor: staff })).rejects.toBeInstanceOf(SuspensionError);
    await expect(suspendTenant(world.app, { tenantId: 'missing', source: 'PLATFORM', category: 'OTHER', reason: 'x', actor: staff })).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
  });
});
