import { PERMISSIONS, ROLE_PERMISSIONS, Role, type Permission } from "@fauward/internal-rbac";

export type PlatformSessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  permissions: string[];
};

export type PlatformPermissionContext = {
  roles: Role[];
  permissions: Permission[];
};

const legacyPermissionMap: Record<string, Permission[]> = {
  "tenant:read": ["platform.tenants.read", "customer.360.read"],
  "tenant:suspend": ["platform.tenants.suspend"],
  "tenant:unsuspend": ["platform.tenants.suspend"],
  "tenant:plan_override": ["platform.tenants.write", "revenue.subscriptions.override"],
  "tenant:impersonate": ["platform.impersonation.start"],
  "region:read": ["platform.integrations.read"],
  "region:approve": ["platform.integrations.write"],
  "region:reject": ["platform.integrations.write"],
  "billing:view": ["revenue.invoices.read", "revenue.subscriptions.read"],
  "revenue:view": ["revenue.analytics.read"],
  "system:health": ["platform.health.read"],
  "queue:view": ["platform.queues.read"],
  "relay:view": ["customer.support.read"],
  "relay:respond": ["customer.support.write"],
  "logs:view": ["trust.audit.read"],
  "logs:view_sensitive": ["trust.audit.read"],
  "audit:view": ["trust.audit.read"],
  "platform_users:manage": ["trust.iam.read", "trust.iam.write"]
};

const roleMap: Record<string, Role[]> = {
  SUPER_ADMIN: [Role.ROOT],
  PLATFORM_SUPPORT: [Role.SUPPORT_LEAD],
  PLATFORM_OPERATIONS: [Role.PLATFORM_ENGINEER],
  PLATFORM_FINANCE: [Role.FINANCE_ADMIN],
  PLATFORM_READONLY: [Role.EXECUTIVE]
};

function isDottedPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function buildPermissionContext(user: PlatformSessionUser): PlatformPermissionContext {
  const roles = user.role ? roleMap[user.role] ?? [] : [];
  const permissions = new Set<Permission>();

  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      permissions.add(permission);
    }
  }

  for (const permission of user.permissions) {
    if (isDottedPermission(permission)) {
      permissions.add(permission);
      continue;
    }

    for (const mapped of legacyPermissionMap[permission] ?? []) {
      permissions.add(mapped);
    }
  }

  return {
    roles,
    permissions: Array.from(permissions)
  };
}
