import { describe, expect, it, vi } from 'vitest';
import { backfillLegacyRoleAssignments } from './legacy-role-assignments.js';

type Staff = { id: string; platformUserId: string | null; email: string; roleAssignments: Array<{ roleId: string }> };

function world() {
  const users = [
    { id: 'pu_root', email: 'root@fauward.com', name: 'Root', role: 'SUPER_ADMIN', status: 'ACTIVE', mfaEnabled: true, lastLoginAt: null },
    { id: 'pu_fin', email: 'fin@fauward.com', name: 'Fin', role: 'PLATFORM_FINANCE', status: 'ACTIVE', mfaEnabled: true, lastLoginAt: null },
    { id: 'pu_sup', email: 'sup@fauward.com', name: null, role: 'PLATFORM_SUPPORT', status: 'ACTIVE', mfaEnabled: false, lastLoginAt: null }
  ];
  const staff = new Map<string, Staff>([
    // already provisioned with a different role: must not be touched (S5)
    ['s_fin', { id: 's_fin', platformUserId: 'pu_fin', email: 'fin@fauward.com', roleAssignments: [{ roleId: 'EXECUTIVE' }] }],
    // exists by email but not linked, no roles
    ['s_sup', { id: 's_sup', platformUserId: null, email: 'sup@fauward.com', roleAssignments: [] }]
  ]);
  const assignments: Array<{ staffId: string; roleId: string; grantedBy: string }> = [];
  const prisma = {
    platformUser: { findMany: vi.fn(async () => users) },
    staffUser: {
      findUnique: vi.fn(async ({ where }: { where: { platformUserId?: string; email?: string } }) => [...staff.values()].find((row) => (where.platformUserId ? row.platformUserId === where.platformUserId : row.email === where.email)) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Staff> }) => Object.assign(staff.get(where.id)!, data)),
      create: vi.fn(async ({ data }: { data: { platformUserId: string; email: string } }) => {
        const row: Staff = { id: `s_${data.platformUserId}`, platformUserId: data.platformUserId, email: data.email, roleAssignments: [] };
        staff.set(row.id, row);
        return row;
      })
    },
    staffRoleAssignment: {
      upsert: vi.fn(async ({ create }: { create: { staffId: string; roleId: string; grantedBy: string } }) => {
        if (!assignments.some((row) => row.staffId === create.staffId && row.roleId === create.roleId)) assignments.push(create);
        staff.get(create.staffId)!.roleAssignments.push({ roleId: create.roleId });
        return create;
      })
    }
  };
  return { prisma, staff, assignments };
}

describe('0039a legacy role backfill (D2)', () => {
  it('dry-run prints counts and writes nothing', async () => {
    const { prisma, assignments } = world();
    const result = await backfillLegacyRoleAssignments(prisma as never, { dryRun: true });
    expect(result).toMatchObject({ dryRun: true, platformUsers: 3, staffCreated: 1, staffLinked: 1, assignmentsCreated: 2, skippedAlreadyHasRoles: 1, byRole: { ROOT: 1, SUPPORT_LEAD: 1 } });
    expect(assignments).toEqual([]);
    expect(prisma.staffUser.create).not.toHaveBeenCalled();
  });

  it('creates mapped assignments with grantedBy legacy-backfill, never touches staff that already hold roles, and is idempotent', async () => {
    const { prisma, assignments, staff } = world();
    await backfillLegacyRoleAssignments(prisma as never, { dryRun: false });
    expect(assignments).toEqual([
      { staffId: 's_pu_root', roleId: 'ROOT', grantedBy: 'legacy-backfill' },
      { staffId: 's_sup', roleId: 'SUPPORT_LEAD', grantedBy: 'legacy-backfill' }
    ]);
    expect(staff.get('s_sup')!.platformUserId).toBe('pu_sup');
    expect(staff.get('s_fin')!.roleAssignments).toEqual([{ roleId: 'EXECUTIVE' }]);

    const second = await backfillLegacyRoleAssignments(prisma as never, { dryRun: false });
    expect(second).toMatchObject({ staffCreated: 0, staffLinked: 0, assignmentsCreated: 0, skippedAlreadyHasRoles: 3 });
    expect(assignments).toHaveLength(2);
  });
});
