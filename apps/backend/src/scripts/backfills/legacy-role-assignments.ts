import type { PrismaClient } from '@prisma/client';
import { LEGACY_PLATFORM_ROLE_TO_STAFF_ROLE } from '../../services/staff-iam.service.js';

export const LEGACY_BACKFILL_GRANTOR = 'legacy-backfill';

export type LegacyRoleBackfillResult = {
  dryRun: boolean;
  platformUsers: number;
  staffCreated: number;
  staffLinked: number;
  assignmentsCreated: number;
  skippedAlreadyHasRoles: number;
  byRole: Record<string, number>;
};

/**
 * One-time backfill (WP-1.1, D2): every PlatformUser gets a StaffUser and, if that staff user has no role assignment
 * yet, the staff role mapped from the legacy PlatformRole (`grantedBy: 'legacy-backfill'`). Idempotent: staff that
 * already hold any role are left alone, so roles an IAM admin revoked are never re-added (S5). After this runs,
 * `ensureStaffUserForPlatformUser` only links or creates the StaffUser row.
 */
export async function backfillLegacyRoleAssignments(prisma: PrismaClient, options: { dryRun: boolean }): Promise<LegacyRoleBackfillResult> {
  const result: LegacyRoleBackfillResult = { dryRun: options.dryRun, platformUsers: 0, staffCreated: 0, staffLinked: 0, assignmentsCreated: 0, skippedAlreadyHasRoles: 0, byRole: {} };
  const users = await prisma.platformUser.findMany({ orderBy: { createdAt: 'asc' } });
  result.platformUsers = users.length;

  for (const user of users) {
    const roleId = LEGACY_PLATFORM_ROLE_TO_STAFF_ROLE[user.role];
    let staff =
      (await prisma.staffUser.findUnique({ where: { platformUserId: user.id }, include: { roleAssignments: true } })) ??
      (await prisma.staffUser.findUnique({ where: { email: user.email }, include: { roleAssignments: true } }));

    if (staff && !staff.platformUserId) {
      result.staffLinked += 1;
      if (!options.dryRun) await prisma.staffUser.update({ where: { id: staff.id }, data: { platformUserId: user.id } });
    }

    if (staff && staff.roleAssignments.length > 0) {
      result.skippedAlreadyHasRoles += 1;
      continue;
    }

    if (!staff) {
      result.staffCreated += 1;
      if (!options.dryRun) {
        staff = await prisma.staffUser.create({
          data: {
            platformUserId: user.id,
            email: user.email,
            name: user.name ?? user.email,
            ssoProvider: 'totp',
            status: user.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
            mfaEnabled: user.mfaEnabled,
            lastLoginAt: user.lastLoginAt
          },
          include: { roleAssignments: true }
        });
      }
    }

    if (!roleId) continue;
    result.assignmentsCreated += 1;
    result.byRole[roleId] = (result.byRole[roleId] ?? 0) + 1;
    if (!options.dryRun && staff) {
      await prisma.staffRoleAssignment.upsert({
        where: { staffId_roleId: { staffId: staff.id, roleId } },
        update: {},
        create: { staffId: staff.id, roleId, grantedBy: LEGACY_BACKFILL_GRANTOR }
      });
    }
  }
  return result;
}
