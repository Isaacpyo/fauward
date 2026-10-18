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

const LEGACY_PLATFORM_ROLE_TO_STAFF_ROLE: Record<string, Role> = {
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
 * Resolves (or, the first time, creates) the StaffUser behind a PlatformUser. The legacy PlatformRole is mapped to a
 * staff role only when the StaffUser is created; an existing staff user's roles are never re-added (S5), so a revoked
 * legacy-mapped role stays revoked. Staff roles are seeded at boot and by `staff:roles:seed`, never per request.
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

  const roleId = LEGACY_PLATFORM_ROLE_TO_STAFF_ROLE[user.role] ?? Role.EXECUTIVE;
  const legacyRoles: string[] = user.role === 'SUPER_ADMIN' ? [roleId, 'SUPER_ADMIN'] : [roleId];
  return prisma.staffUser.create({
    data: {
      platformUserId: user.id,
      email: user.email,
      name: user.name ?? user.email,
      ssoProvider: user.role === 'SUPER_ADMIN' ? 'root' : 'totp',
      status: user.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt,
      roleAssignments: { create: legacyRoles.map((legacyRoleId) => ({ roleId: legacyRoleId, grantedBy: 'legacy-platform-role' })) }
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

export async function platformUserHasStaffPermission(prisma: PrismaClient, user: PlatformUser, permission: Permission) {
  const context = await staffPermissionContextForPlatformUser(prisma, user);
  return context.permissions.includes(permission);
}

/** Role permissions ∪ active JIT grants — the same rule as requireInternalPermission, for checks inside handlers. */
export async function platformUserHasConsolePermission(prisma: PrismaClient, user: PlatformUser, permission: Permission) {
  if (await platformUserHasStaffPermission(prisma, user, permission)) return true;
  const grant = await prisma.jitAccessRequest.findFirst({
    where: { requesterPlatformUserId: user.id, permission, status: 'APPROVED', revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true }
  });
  return Boolean(grant);
}
