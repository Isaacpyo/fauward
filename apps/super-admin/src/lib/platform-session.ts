import { PERMISSIONS, Role, type Permission } from "@fauward/internal-rbac";

import type { MeResponse } from "./use-me";

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

const KNOWN_PERMISSIONS = new Set<string>(PERMISSIONS);
const KNOWN_ROLES = new Set<string>(Object.values(Role));

/**
 * The console never derives permissions from roles (D2): permissions are exactly what /auth/me returns (role grants ∪
 * active JIT grants), and roles are the staff roles it lists, kept only for display and RoleGate.
 */
export function permissionContextFromMe(me: Pick<MeResponse, "roles" | "permissions">): PlatformPermissionContext {
  return {
    roles: me.roles.filter((role): role is Role => KNOWN_ROLES.has(role)),
    permissions: me.permissions.filter((permission): permission is Permission => KNOWN_PERMISSIONS.has(permission))
  };
}
