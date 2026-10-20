import type { PlatformUser, PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS, Role, type Permission } from '@fauward/internal-rbac';

export const STAFF_ROLE_DEFINITIONS = [
  ...Object.values(Role).map((role) => ({
    id: role,
    name: role.replaceAll('_', ' '),
    description: role === Role.ROOT ? 'Emergency full-access staff role. Requires TOTP until WebAuthn is added.' : `System role for ${role.replaceAll('_', ' ').toLowerCase()}.`,
    permissions: ROLE_PERMISSIONS[role],
    isSystem: true,
    deprecated: false
  })),
  {
    id: 'SUPER_ADMIN',
    name: 'SUPER ADMIN',
    description: 'Deprecated legacy role retained for migration compatibility. Use ROOT for new assignments.',
    permissions: ROLE_PERMISSIONS[Role.ROOT],
    isSystem: true,
    deprecated: true
  }
] as const;

/** Legacy PlatformRole → staff role, used only by the one-time backfill `0039a-legacy-role-assignments.ts` (D2). */
export const LEGACY_PLATFORM_ROLE_TO_STAFF_ROLE: Record<string, Role> = {
  SUPER_ADMIN: Role.ROOT,
  PLATFORM_SUPPORT: Role.SUPPORT_LEAD,
  PLATFORM_OPERATIONS: Role.PLATFORM_ENGINEER,
  PLATFORM_FINANCE: Role.FINANCE_ADMIN,
  PLATFORM_READONLY: Role.EXECUTIVE
};

function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export async function seedStaffRoles(prisma: PrismaClient) {
  await Promise.all(
    STAFF_ROLE_DEFINITIONS.map((role) =>
      prisma.staffRole.upsert({
        where: { id: role.id },
        create: {
          id: role.id,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          isSystem: role.isSystem,
          deprecated: role.deprecated
        },
        update: {
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          isSystem: role.isSystem,
          deprecated: role.deprecated
        }
      })
    )
  );
}

const activeAssignmentsInclude = () => ({
  roleAssignments: { include: { role: true }, where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }
});

/**
 * Resolves (or, the first time, creates) the StaffUser behind a PlatformUser. It only links or creates the row and never
 * assigns roles (S5, D2): legacy PlatformRole → staff role mapping happened once, in the `0039a` backfill. A staff user
 * without role assignments has no permissions until an IAM admin grants one.
 */
export async function ensureStaffUserForPlatformUser(prisma: PrismaClient, user: PlatformUser) {
  const existing =
    (await prisma.staffUser.findUnique({ where: { platformUserId: user.id }, include: activeAssignmentsInclude() })) ??
    (await prisma.staffUser.findUnique({ where: { email: user.email }, include: activeAssignmentsInclude() }));

  if (existing) {
    if (!existing.platformUserId) {
      await prisma.staffUser.update({ where: { id: existing.id }, data: { platformUserId: user.id } });
    }
    return existing;
  }

  return prisma.staffUser.create({
    data: {
      platformUserId: user.id,
      email: user.email,
      name: user.name ?? user.email,
      ssoProvider: 'totp',
      status: user.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt
    },
    include: activeAssignmentsInclude()
  });
}

export async function staffPermissionContextForPlatformUser(prisma: PrismaClient, user: PlatformUser) {
  const staff = await ensureStaffUserForPlatformUser(prisma, user);
  const roles = staff.roleAssignments.map((assignment) => assignment.role.id);
  const permissions = new Set<Permission>();

  for (const assignment of staff.roleAssignments) {
    for (const permission of assignment.role.permissions) {
      if (isPermission(permission)) permissions.add(permission);
    }
  }

  return {
    staff,
    roles,
    permissions: Array.from(permissions)
  };
}

export type JitGrantSummary = { id: string; permission: Permission; expiresAt: Date | null };

/**
 * Effective console permissions: role permissions ∪ active, approved, unexpired JIT grants (D2). Computed once per
 * request by `requireConsolePermission` and returned by `/auth/me`.
 */
export async function consolePermissionContext(prisma: PrismaClient, user: PlatformUser) {
  const context = await staffPermissionContextForPlatformUser(prisma, user);
  const grants = await prisma.jitAccessRequest.findMany({
    where: { requesterPlatformUserId: user.id, status: 'APPROVED', revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, permission: true, expiresAt: true },
    orderBy: { expiresAt: 'desc' }
  });
  const jit = new Map<Permission, JitGrantSummary>();
  for (const grant of grants) {
    if (isPermission(grant.permission) && !jit.has(grant.permission)) jit.set(grant.permission, { id: grant.id, permission: grant.permission, expiresAt: grant.expiresAt });
  }
  const rolePermissions = new Set<Permission>(context.permissions);
  return {
    staff: context.staff,
    roles: context.roles,
    rolePermissions,
    jit,
    permissions: Array.from(new Set<Permission>([...rolePermissions, ...jit.keys()]))
  };
}
