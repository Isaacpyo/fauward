import type { PlatformUser, PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS, Role, type Permission } from '@fauward/internal-rbac';
import { permissionsForPlatformRole } from './platform-permission.service.js';

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

export async function ensureStaffUserForPlatformUser(prisma: PrismaClient, user: PlatformUser) {
  await seedStaffRoles(prisma);
  const existing = await prisma.staffUser.findUnique({ where: { email: user.email } });
  const staff =
    existing ??
    (await prisma.staffUser.create({
      data: {
        platformUserId: user.id,
        email: user.email,
        name: user.name ?? user.email,
        ssoProvider: user.role === 'SUPER_ADMIN' ? 'root' : 'totp',
        status: user.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
        mfaEnabled: user.mfaEnabled,
        lastLoginAt: user.lastLoginAt
      }
    }));

  if (!staff.platformUserId) {
    await prisma.staffUser.update({ where: { id: staff.id }, data: { platformUserId: user.id } });
  }

  const roleId = LEGACY_PLATFORM_ROLE_TO_STAFF_ROLE[user.role] ?? Role.EXECUTIVE;
  await prisma.staffRoleAssignment.upsert({
    where: { staffId_roleId: { staffId: staff.id, roleId } },
    create: { staffId: staff.id, roleId, grantedBy: 'legacy-platform-role' },
    update: {}
  });

  if (user.role === 'SUPER_ADMIN') {
    await prisma.staffRoleAssignment.upsert({
      where: { staffId_roleId: { staffId: staff.id, roleId: 'SUPER_ADMIN' } },
      create: { staffId: staff.id, roleId: 'SUPER_ADMIN', grantedBy: 'legacy-platform-role' },
      update: {}
    });
  }

  return prisma.staffUser.findUniqueOrThrow({
    where: { id: staff.id },
    include: { roleAssignments: { include: { role: true }, where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } }
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

  if (permissions.size === 0) {
    for (const permission of permissionsForPlatformRole(user.role)) {
      permissions.add(permission as Permission);
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
