import type { PrismaClient } from '@prisma/client';
import { DEFAULT_PUBLIC_REASONS } from '../../services/tenant-suspension.service.js';

export type SuspensionBackfillResult = { dryRun: boolean; suspendedTenants: number; recordsCreated: number; appealsLinked: number };

/**
 * One-time backfill for migration 0042_suspension_unification (D3): every SUSPENDED tenant without an ACTIVE
 * SuspensionRecord gets one (source SYSTEM), and open appeals without a suspension are linked to it. The old
 * Tenant.suspensionReason held the staff's internal reason, so it is kept as the internal reason and the tenant sees
 * the generic public text. Idempotent.
 */
export async function backfillSuspensionRecords(prisma: PrismaClient, options: { dryRun: boolean }): Promise<SuspensionBackfillResult> {
  const result: SuspensionBackfillResult = { dryRun: options.dryRun, suspendedTenants: 0, recordsCreated: 0, appealsLinked: 0 };
  const tenants = await prisma.tenant.findMany({ where: { status: 'SUSPENDED' }, select: { id: true, suspensionReason: true, suspendedAt: true, updatedAt: true } });
  result.suspendedTenants = tenants.length;

  for (const tenant of tenants) {
    let active = await prisma.suspensionRecord.findFirst({ where: { tenantId: tenant.id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
    if (!active) {
      result.recordsCreated += 1;
      if (!options.dryRun) {
        active = await prisma.suspensionRecord.create({
          data: {
            tenantId: tenant.id,
            reason: tenant.suspensionReason ?? 'Backfilled from tenant status',
            publicReason: DEFAULT_PUBLIC_REASONS.OTHER,
            source: 'SYSTEM',
            category: 'OTHER',
            suspendedBy: 'system',
            status: 'ACTIVE',
            createdAt: tenant.suspendedAt ?? tenant.updatedAt
          }
        });
      }
    }
    const openAppeals = await prisma.tenantAppeal.findMany({ where: { tenantId: tenant.id, suspensionId: null, status: { in: ['OPEN', 'PENDING'] } }, select: { id: true } });
    result.appealsLinked += openAppeals.length;
    if (!options.dryRun && active && openAppeals.length > 0) {
      await prisma.tenantAppeal.updateMany({ where: { tenantId: tenant.id, id: { in: openAppeals.map((appeal) => appeal.id) } }, data: { suspensionId: active.id } });
    }
  }
  return result;
}
