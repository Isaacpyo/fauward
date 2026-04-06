import type { PrismaClient } from '@prisma/client';

export async function handleDunningEvent(prisma: PrismaClient, event: {
  tenantId: string;
  attempt: number;
}) {
  const { tenantId, attempt } = event;

  if (attempt === 1) {
    await prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'EMAIL',
        event: 'billing_payment_failed_attempt_1',
        status: 'QUEUED'
      }
    });
    return { tenantStatus: 'ACTIVE', retryInDays: 3 };
  }

  if (attempt === 2) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED' }
    });
    await prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'EMAIL',
        event: 'billing_payment_failed_attempt_2',
        status: 'QUEUED'
      }
    });
    return { tenantStatus: 'SUSPENDED', retryInDays: 4 };
  }

  if (attempt >= 3) {
    await prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'EMAIL',
        event: 'billing_payment_failed_final_warning',
        status: 'QUEUED'
      }
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant?.status === 'SUSPENDED' && tenant.updatedAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
      await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'CANCELLED' } });
      await prisma.notificationLog.create({
        data: {
          tenantId,
          channel: 'EMAIL',
          event: 'billing_account_cancelled_after_dunning',
          status: 'QUEUED'
        }
      });
      return { tenantStatus: 'CANCELLED', retryInDays: 0 };
    }

    return { tenantStatus: tenant?.status ?? 'ACTIVE', retryInDays: 0 };
  }

  return { tenantStatus: 'ACTIVE', retryInDays: 0 };
}
