import type { PlatformRole } from '@prisma/client';

export const PLATFORM_PERMISSIONS = [
  'tenant:read',
  'tenant:suspend',
  'tenant:unsuspend',
  'tenant:plan_override',
  'tenant:impersonate',
  'region:read',
  'region:approve',
  'region:reject',
  'billing:view',
  'revenue:view',
  'system:health',
  'queue:view',
  'relay:view',
  'relay:respond',
  'logs:view',
  'logs:view_sensitive',
  'audit:view',
  'platform_users:manage'
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const rolePermissions: Record<PlatformRole, PlatformPermission[]> = {
  SUPER_ADMIN: [...PLATFORM_PERMISSIONS],
  PLATFORM_SUPPORT: ['tenant:read', 'tenant:impersonate', 'region:read', 'relay:view', 'relay:respond', 'logs:view', 'audit:view'],
  PLATFORM_OPERATIONS: [
    'tenant:read',
    'tenant:suspend',
    'tenant:unsuspend',
    'tenant:impersonate',
    'region:read',
    'region:approve',
    'region:reject',
    'system:health',
    'queue:view',
    'logs:view',
    'audit:view'
  ],
  PLATFORM_FINANCE: ['tenant:read', 'tenant:plan_override', 'billing:view', 'revenue:view', 'audit:view'],
  PLATFORM_READONLY: ['tenant:read', 'region:read', 'billing:view', 'revenue:view', 'system:health', 'queue:view', 'relay:view', 'logs:view', 'audit:view']
};

export function permissionsForPlatformRole(role: PlatformRole): PlatformPermission[] {
  return rolePermissions[role] ?? [];
}

export function platformRoleHasPermission(role: PlatformRole, permission: PlatformPermission): boolean {
  return permissionsForPlatformRole(role).includes(permission);
}
