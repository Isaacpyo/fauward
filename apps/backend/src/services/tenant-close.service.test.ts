import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripe = vi.hoisted(() => ({ configured: false, cancel: vi.fn(async () => ({ id: 'sub_1', status: 'active', cancelAtPeriodEnd: true })) }));
vi.mock('../modules/payments/stripe.service.js', () => ({ stripeService: { isConfigured: () => stripe.configured, cancelSubscriptionAtPeriodEnd: stripe.cancel } }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined) }));

const { closeTenant, TenantCloseError } = await import('./tenant-close.service.js');

const actor = { type: 'STAFF' as const, platformUserId: 'pu_1', email: 'admin@fauward.com', label: 'Platform Admin' };

function world(options: { hold?: boolean; stripeSubscriptionId?: string | null } = {}) {
  const tenant: Record<string, unknown> = { id: 't_1', name: 'Northwind', slug: 'northwind', status: 'ACTIVE', closedAt: null, subscription: { stripeSubscriptionId: options.stripeSubscriptionId ?? null } };
  const records: Array<Record<string, unknown>> = [];
  const inApp: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];
  const prisma = {
    tenant: {
      findUnique: vi.fn(async () => tenant),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(tenant, data))
    },
    legalHold: { findFirst: vi.fn(async () => (options.hold ? { id: 'hold_1', tenantId: 't_1', reason: 'Litigation 2026-17' } : null)) },
    suspensionRecord: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `susp_${records.length + 1}`, createdAt: new Date(), ...data };
        records.push(row);
        return row;
      })
    },
    subscription: { update: vi.fn(async () => ({})) },
    platformAuditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => audit.push(data)) },
    platformActivity: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'act', ...create })) },
    user: { findMany: vi.fn(async () => [{ id: 'u_admin', email: 'owner@northwind.test' }]) },
    inAppNotification: { createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => inApp.push(...data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma))
  };
  const app = { prisma, redis: { publish: vi.fn(async () => 1), del: vi.fn(async () => 1) }, log: { error: vi.fn(), warn: vi.fn() } };
  return { app: app as never, tenant, records, inApp, audit, prisma };
}

beforeEach(() => {
  stripe.configured = false;
  stripe.cancel.mockClear();
});

describe('closeTenant (WP-1.2)', () => {
  it('ACC-TEN-7 requires the typed slug', async () => {
    const w = world();
    await expect(closeTenant(w.app, { tenantId: 't_1', reason: 'Customer asked to close', confirmSlug: 'north', actor })).rejects.toMatchObject({ code: 'SLUG_MISMATCH', statusCode: 400 });
    expect(w.prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('ACC-TEN-7 is blocked by an active legal hold (409 LEGAL_HOLD_ACTIVE)', async () => {
    const w = world({ hold: true });
    await expect(closeTenant(w.app, { tenantId: 't_1', reason: 'Customer asked to close', confirmSlug: 'northwind', actor })).rejects.toBeInstanceOf(TenantCloseError);
    await expect(closeTenant(w.app, { tenantId: 't_1', reason: 'Customer asked to close', confirmSlug: 'northwind', actor })).rejects.toMatchObject({ code: 'LEGAL_HOLD_ACTIVE', statusCode: 409 });
    expect(w.prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('closes: CANCELLED, closedAt, purgeAfter = +90 days, a PLATFORM/OTHER suspension cause, admins notified; works without Stripe', async () => {
    const w = world();
    const result = await closeTenant(w.app, { tenantId: 't_1', reason: 'Customer asked to close', confirmSlug: 'NorthWind', actor });
    expect(w.tenant).toMatchObject({ status: 'CANCELLED', closedReason: 'Customer asked to close' });
    const closedAt = w.tenant.closedAt as Date;
    expect((w.tenant.purgeAfter as Date).getTime() - closedAt.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
    expect(w.records).toEqual([expect.objectContaining({ source: 'PLATFORM', category: 'OTHER', status: 'ACTIVE' })]);
    expect(w.audit.map((row) => row.action)).toEqual(['TENANT_CLOSED', 'TENANT_SUSPENSION']);
    // Only the "closed" notice; the suspension of an already closed tenant does not send "suspended".
    expect(w.inApp.map((row) => row.type)).toEqual(['tenant.closed']);
    expect(result.stripe).toEqual({ status: 'NOT_CONFIGURED', message: 'Stripe is not configured: no Stripe subscription to cancel.' });
  });

  it('cancels the Stripe subscription at period end when configured; a Stripe failure is reported, not fatal', async () => {
    stripe.configured = true;
    const ok = world({ stripeSubscriptionId: 'sub_1' });
    expect((await closeTenant(ok.app, { tenantId: 't_1', reason: 'Customer asked to close', confirmSlug: 'northwind', actor })).stripe).toEqual({ status: 'CANCEL_AT_PERIOD_END', subscriptionId: 'sub_1' });
    expect(ok.prisma.subscription.update).toHaveBeenCalledWith({ where: { tenantId: 't_1' }, data: { cancelAtPeriodEnd: true } });

    stripe.cancel.mockRejectedValueOnce(new Error('No such subscription'));
    const failing = world({ stripeSubscriptionId: 'sub_gone' });
    const result = await closeTenant(failing.app, { tenantId: 't_1', reason: 'Customer asked to close', confirmSlug: 'northwind', actor });
    expect(result.stripe).toEqual({ status: 'FAILED', subscriptionId: 'sub_gone', message: 'No such subscription' });
    expect(failing.tenant.status).toBe('CANCELLED');
  });

  it('a second close is a 409', async () => {
    const w = world();
    w.tenant.closedAt = new Date();
    await expect(closeTenant(w.app, { tenantId: 't_1', reason: 'Customer asked to close', confirmSlug: 'northwind', actor })).rejects.toMatchObject({ code: 'TENANT_ALREADY_CLOSED' });
  });
});
