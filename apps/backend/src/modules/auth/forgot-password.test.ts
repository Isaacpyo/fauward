import { describe, expect, it, vi } from 'vitest';

// C61 (WP-2.2): the password-reset token travels only in the email. It used to be returned in the API response and
// stored in NotificationLog.providerRef, so anyone could reset any account knowing its email.

const queueAdd = vi.hoisted(() => vi.fn(async () => ({ id: 'job' })));
vi.mock('../../queues/queues.js', () => ({ notificationQueue: { add: queueAdd } }));
vi.mock('../../queues/python-services.js', () => ({ publishPythonServiceJob: vi.fn(async () => undefined) }));

const { authService } = await import('./auth.service.js');

function prismaWith(user: { id: string; email: string } | null) {
  return {
    user: { findFirst: vi.fn(async () => user) },
    passwordResetToken: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data) }
  };
}

describe('forgot password (C61)', () => {
  it('responds without the token and queues a password_reset email whose link carries it', async () => {
    const prisma = prismaWith({ id: 'u_1', email: 'ada@northwind.test' });
    const result = await authService.forgotPassword({ email: 'Ada@Northwind.test' }, prisma as never, 'tenant_a');
    expect(result).toEqual({ success: true });
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const [, job] = queueAdd.mock.calls[0] as unknown as [string, { to: string; template: string; tenantId: string; data: { resetUrl: string } }];
    expect(job).toMatchObject({ to: 'ada@northwind.test', template: 'password_reset', tenantId: 'tenant_a' });
    const token = new URL(job.data.resetUrl).searchParams.get('token');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    // Only the hash is stored.
    const stored = (prisma.passwordResetToken.create.mock.calls[0] as unknown as [{ data: { tokenHash: string } }])[0].data;
    expect(stored.tokenHash).not.toBe(token);
  });

  it('an unknown email gets the same answer and no email', async () => {
    queueAdd.mockClear();
    const result = await authService.forgotPassword({ email: 'nobody@northwind.test' }, prismaWith(null) as never, 'tenant_a');
    expect(result).toEqual({ success: true });
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('a queue failure gets the same answer as an unknown email, and is logged', async () => {
    queueAdd.mockRejectedValueOnce(new Error('queue down'));
    const log = { error: vi.fn() };
    const prisma = prismaWith({ id: 'u_1', email: 'ada@northwind.test' });
    const result = await authService.forgotPassword({ email: 'ada@northwind.test' }, prisma as never, 'tenant_a', log);
    expect(result).toEqual({ success: true });
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ template: 'password_reset', userId: 'u_1' }), 'Sign-in email not queued');
  });
});
