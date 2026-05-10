import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Permission } from './permissions.js';
import { roleHasPermission, type Role } from './roles.js';
import type { PermissionGateProps, PermissionProviderProps, RoleGateProps } from './types.js';

const PermissionContext = createContext<{ roles: Role[]; permissions: Permission[] } | null>(null);

function list<T>(value: T | readonly T[]): T[] {
  return Array.isArray(value) ? value.slice() : [value as T];
}

export function PermissionProvider({ roles, permissions, children }: PermissionProviderProps) {
  const contextValue = useMemo(() => ({ roles, permissions }), [roles, permissions]);
  return <PermissionContext.Provider value={contextValue}>{children}</PermissionContext.Provider>;
}

export function hasPermission(grants: readonly Permission[], requested: Permission | readonly Permission[], requireAll = false): boolean {
  const requestedList = list(requested);
  return requireAll
    ? requestedList.every((permission) => grants.includes(permission))
    : requestedList.some((permission) => grants.includes(permission));
}

export function usePermission(permission?: Permission | readonly Permission[], options?: { requireAll?: boolean }) {
  const context = useContext(PermissionContext);
  if (!context) {
    return permission ? false : { roles: [], permissions: [] };
  }

  if (!permission) {
    return context;
  }

  return hasPermission(context.permissions, permission, options?.requireAll);
}

export function PermissionGate({ permission, children, fallback = null, requireAll = false }: PermissionGateProps) {
  const allowed = usePermission(permission, { requireAll });
  return allowed ? <>{children}</> : <>{fallback}</>;
}

export function RoleGate({ roles, children, fallback = null, requireAll = false }: RoleGateProps) {
  const context = useContext(PermissionContext);
  const requiredRoles = list(roles);
  const allowed = requireAll
    ? requiredRoles.every((role) => context?.roles.includes(role))
    : requiredRoles.some((role) => context?.roles.includes(role));

  return allowed ? <>{children}</> : <>{fallback}</>;
}

export function hasPermissionForRoles(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => roleHasPermission(role, permission));
}

export type { ReactNode };
