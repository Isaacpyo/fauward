import type { ReactNode } from 'react';
import type { Permission } from './permissions.js';
import type { Role } from './roles.js';

export type PermissionContextValue = {
  roles: Role[];
  permissions: Permission[];
};

export type PermissionProviderProps = PermissionContextValue & {
  children: ReactNode;
};

export type RoleGateProps = {
  roles: Role | readonly Role[];
  children: ReactNode;
  fallback?: ReactNode;
  requireAll?: boolean;
};

export type PermissionGateProps = {
  permission: Permission | readonly Permission[];
  children: ReactNode;
  fallback?: ReactNode;
  requireAll?: boolean;
};

export type PermissionRequest = {
  permission: Permission;
  actorId?: string;
  reason?: string;
};

export type PermissionReplyLike = {
  status: (code: number) => {
    send: (payload: unknown) => unknown;
  };
};

export type PermissionRequestLike = {
  permissions?: readonly Permission[];
  user?: {
    permissions?: readonly Permission[];
    roles?: readonly Role[];
  };
  platform?: {
    user?: {
      permissions?: readonly Permission[];
      roles?: readonly Role[];
      role?: Role;
    };
  };
};
