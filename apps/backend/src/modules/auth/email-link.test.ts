import { describe, expect, it, vi, beforeEach } from 'vitest';

// C61 / C61b: the Fauward Go sign-in token travels only in the email. `POST /api/v1/auth/email-link/request` used to
// return it as `linkToken`, so anyone knowing a field user's email could sign in as them.

const queueAdd = vi.hoisted(() => vi.fn(async () => ({ id: 'job' })));
vi.mock('../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd } }));
vi.mock('../../queues/python-services.js', () => ({ publishPythonServiceJob: vi.fn(async () => undefined) }));

const { authService } = await import('./auth.service.js');
const { config } = await import('../../config/index.js');

type Job = { tenantId: string; userId: string; to: string; template: string; event: string; data: { link: string; expiresInMinutes: number } };

const ada = {
  id: 'u_1',
  email: 'ada@northwind.test',
  role: 'TENANT_DRIVER',
  tenantId: 'tenant_a',
  tenant: { id: 'tenant_a', slug: 'northwind', plan: 'PRO' }
};

function prismaWith(user: typeof ada | null, tenantIds: string[] = user ? [user.tenantId] : []) {
  return {
    user: {
      findMany: vi.fn(async () => tenantIds.map((tenantId) => ({ tenantId }))),
      findFirst: vi.fn(async () => user),
      updateMany: vi.fn(async () => ({ count: 1 }))
    },
    tenant: { findUnique: vi.fn(async () => (user ? user.tenant : null)) },
    refreshToken: { create: vi.fn(async () => ({ id: 'rt_1' })) },
    platformActivity: { create: vi.fn(async () => ({})) }
  };
}

function queuedJob() {
  expect(queueAdd).toHaveBeenCalledTimes(1);
  return (queueAdd.mock.calls[0] as unknown as [string, Job])[1];
}

describe('email-link sign-in request (C61)', () => {
  beforeEach(() => queueAdd.mockClear());

  it('responds without the token and queues a field_email_link email whose Fauward Go link carries it', async () => {
    const prisma = prismaWith(ada);
    const result = await authService.requestEmailLink({ email: ' Ada@Northwind.test ' }, prisma as never);

    expect(result).toEqual({ success: true });
    const job = queuedJob();
    expect(job).toMatchObject({ tenantId: 'tenant_a', userId: 'u_1', to: 'ada@northwind.test', template: 'field_email_link', event: 'field_email_link' });

    const link = new URL(job.data.link);
    expect(`${link.origin}${link.pathname}`).toBe(`${config.fauwardGoUrl}/login`);
    expect(link.searchParams.get('email')).toBe('ada@northwind.test');
    expect(job.data.link).toContain('email=ada%40northwind.test');
    const token = link.searchParams.get('token');
    expect(token).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(token as string);

    // The emailed token is the one that signs in.
    const session = await authService.consumeEmailLink({ email: 'ada@northwind.test', token: token as string }, {
      ...prisma,
      user: { ...prisma.user, findFirst: vi.fn(async () => ({ ...ada, lockedAt: null, lastLogin: new Date(), invitedBy: null })) }
    } as never);
    expect(session).toMatchObject({ tenantSlug: 'northwind', tenantId: 'tenant_a' });
    expect(session.accessToken).toBeTruthy();
  });

  it('an unknown email gets the same answer and no email', async () => {
    const result = await authService.requestEmailLink({ email: 'nobody@northwind.test' }, prismaWith(null) as never);
    expect(result).toEqual({ success: true });
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('without a tenant, an email in more than one workspace gets the same answer and no email', async () => {
    const prisma = prismaWith(ada, ['tenant_a', 'tenant_b']);
    const result = await authService.requestEmailLink({ email: 'ada@northwind.test' }, prisma as never);
    expect(result).toEqual({ success: true });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('a resolved tenant scopes the lookup to that workspace', async () => {
    const prisma = prismaWith(ada, ['tenant_a', 'tenant_b']);
    const result = await authService.requestEmailLink({ email: 'ada@northwind.test' }, prisma as never, 'tenant_a');
    expect(result).toEqual({ success: true });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'ada@northwind.test', tenantId: 'tenant_a', isActive: true } }));
    expect(queuedJob()).toMatchObject({ tenantId: 'tenant_a', template: 'field_email_link' });
  });
});
