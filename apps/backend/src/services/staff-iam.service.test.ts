import type { PlatformUser } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ensureStaffUserForPlatformUser, staffPermissionContextForPlatformUser } from './staff-iam.service.js';

const platformUser: PlatformUser = {
  id: 'pu_1',
  email: 'ops@fauward.com',
  name: 'Ops',
  passwordHash: 'x',
  role: 'PLATFORM_SUPPORT',
  status: 'ACTIVE',
  mfaEnabled: true,
  mfaSecretEncrypted: null,
  mfaPendingSecretEncrypted: null,
  mfaEnrolledAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  disabledAt: null
};

function prismaWith(existing: { id: string; platformUserId: string | null; roleAssignments: Array<{ role: { id: string; permissions: string[] } }> } | null) {
  const prisma = {
    staffUser: {
      findUnique: vi.fn(async () => existing),
      update: vi.fn(async () => existing),
      create: vi.fn(async ({ data }: { data: { roleAssignments?: { create: Array<{ roleId: string }> } } }) => ({
        id: 'staff_new',
        platformUserId: 'pu_1',
        roleAssignments: (data.roleAssignments?.create ?? []).map((assignment) => ({ role: { id: assignment.roleId, permissions: ['customer.support.read'] } }))
      }))
    },
    staffRole: { upsert: vi.fn() },
    staffRoleAssignment: { upsert: vi.fn(), create: vi.fn() }
  };
  return prisma;
}

describe('staff IAM service (S5)', () => {
  it('ACC-IAM-4 a revoked legacy-mapped role is not re-added for an existing staff user', async () => {
    // The staff user's SUPPORT_LEAD (legacy PLATFORM_SUPPORT mapping) was revoked: no assignments left.
    const prisma = prismaWith({ id: 'staff_1', platformUserId: 'pu_1', roleAssignments: [] });
    for (let call = 0; call < 3; call += 1) {
      const context = await staffPermissionContextForPlatformUser(prisma as never, platformUser);
      expect(context.roles).toEqual([]);
      expect(context.permissions).toEqual([]);
    }
    expect(prisma.staffRoleAssignment.upsert).not.toHaveBeenCalled();
    expect(prisma.staffRoleAssignment.create).not.toHaveBeenCalled();
    expect(prisma.staffUser.create).not.toHaveBeenCalled();
  });

  it('ACC-IAM-5 ACC-IAM-8 resolving permissions never upserts staff roles', async () => {
    const prisma = prismaWith({ id: 'staff_1', platformUserId: 'pu_1', roleAssignments: [{ role: { id: 'SUPPORT_LEAD', permissions: ['customer.support.read', 'not.a.permission'] } }] });
    const context = await staffPermissionContextForPlatformUser(prisma as never, platformUser);
    expect(context.permissions).toEqual(['customer.support.read']);
    expect(prisma.staffRole.upsert).not.toHaveBeenCalled();
  });

  it('never assigns roles when it creates the staff user; legacy mapping lives only in the 0039a backfill (D2)', async () => {
    const prisma = prismaWith(null);
    const staff = await ensureStaffUserForPlatformUser(prisma as never, platformUser);
    expect(staff.id).toBe('staff_new');
    const data = (prisma.staffUser.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).not.toHaveProperty('roleAssignments');
    expect(data).toMatchObject({ platformUserId: platformUser.id, email: platformUser.email });
    expect(prisma.staffRole.upsert).not.toHaveBeenCalled();
  });
});
