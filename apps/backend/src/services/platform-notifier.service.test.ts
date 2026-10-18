import { describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.fn(async () => undefined);
const sendStaffEmailMock = vi.fn(async () => undefined);
vi.mock('../modules/notifications/notifications.service.js', () => ({ sendEmail: sendEmailMock, sendStaffEmail: sendStaffEmailMock }));

const { notifyStaff, notifyTenantAdmins } = await import('./platform-notifier.service.js');
const { recordActivity, publishActivity } = await import('./platform-activity.service.js');

function fakeApp(overrides: Record<string, unknown> = {}) {
  const inApp: Array<Record<string, unknown>> = [];
  const staffRows: Array<Record<string, unknown>> = [];
  const app = {
    log: { error: vi.fn() },
    prisma: {
      user: {
        findMany: vi.fn(async () => [
          { id: 'u_admin_1', email: 'one@tenant.test' },
          { id: 'u_admin_2', email: 'two@tenant.test' }
        ]),
        findFirst: vi.fn(async () => null)
      },
      inAppNotification: { createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => inApp.push(...data)) },
      staffUser: { findMany: vi.fn(async () => [{ platformUserId: 'pu_1' }, { platformUserId: 'pu_2' }]) },
      staffNotification: { createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => staffRows.push(...data)) },
      ...overrides
    }
  };
  return { app, inApp, staffRows };
}

describe('PlatformNotifier (D6)', () => {
  it('notifyTenantAdmins writes one in-app row per active TENANT_ADMIN of that tenant and queues the email', async () => {
    const { app, inApp } = fakeApp();
    const result = await notifyTenantAdmins(app as never, {
      tenantId: 't_1',
      event: 'tenant.suspended',
      title: 'Your workspace is suspended',
      email: { template: 'usage_limit_reached' }
    });
    expect(app.prisma.user.findMany).toHaveBeenCalledWith({ where: { tenantId: 't_1', role: 'TENANT_ADMIN', isActive: true }, select: { id: true, email: true } });
    expect(inApp).toHaveLength(2);
    expect(inApp.every((row) => row.tenantId === 't_1' && row.type === 'tenant.suspended')).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ inApp: 2, emailsQueued: 2 });
  });

  it('a notification failure is logged and never thrown to the caller', async () => {
    const { app } = fakeApp({ user: { findMany: vi.fn(async () => Promise.reject(new Error('db down'))) } });
    await expect(notifyTenantAdmins(app as never, { tenantId: 't_1', event: 'x', title: 'y' })).resolves.toEqual({ inApp: 0, emailsQueued: 0 });
    expect(app.log.error).toHaveBeenCalled();
  });

  it('notifyStaff by permission resolves active staff with an unexpired role holding it', async () => {
    const { app, staffRows } = fakeApp();
    const result = await notifyStaff(app as never, { permission: 'trust.jit.approve', event: 'jit.requested', title: 'New JIT request' });
    const where = (app.prisma.staffUser.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ status: 'ACTIVE', roleAssignments: { some: { role: { permissions: { has: 'trust.jit.approve' } } } } });
    expect(staffRows.map((row) => row.platformUserId)).toEqual(['pu_1', 'pu_2']);
    expect(result).toEqual({ inApp: 2 });
  });
});

describe('recordActivity (D7)', () => {
  it('upserts on dedupeKey so a retried producer does not duplicate the row', async () => {
    const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'act_1', ...create }));
    const input = { service: 'platform.tenants', type: 'tenant.suspended', actorType: 'SYSTEM' as const, actorLabel: 'System', subjectType: 'tenant', subjectId: 't_1', summary: 's', dedupeKey: 'k1' };
    await recordActivity({ platformActivity: { upsert } } as never, input);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupeKey: 'k1' }, update: {} }));
  });

  it('publishActivity is fire-and-forget: a Redis failure is logged, not thrown', async () => {
    const log = { error: vi.fn() };
    publishActivity({ publish: vi.fn(async () => Promise.reject(new Error('redis down'))) } as never, { id: 'act_1' }, log);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log.error).toHaveBeenCalled();
  });
});
