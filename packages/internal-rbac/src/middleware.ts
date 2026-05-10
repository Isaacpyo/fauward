import type { Permission } from './permissions.js';
import { hasPermission, hasPermissionForRoles } from './guards.js';
import type { PermissionReplyLike, PermissionRequestLike } from './types.js';

function requestPermissions(request: PermissionRequestLike): readonly Permission[] {
  return request.permissions ?? request.user?.permissions ?? request.platform?.user?.permissions ?? [];
}

function requestRoles(request: PermissionRequestLike) {
  const platformRole = request.platform?.user?.role;
  return request.user?.roles ?? request.platform?.user?.roles ?? (platformRole ? [platformRole] : []);
}

export function requirePermission(permission: Permission) {
  return async (request: PermissionRequestLike, reply: PermissionReplyLike) => {
    const allowed =
      hasPermission(requestPermissions(request), permission) ||
      hasPermissionForRoles(requestRoles(request), permission);

    if (!allowed) {
      return reply.status(403).send({ error: 'Forbidden', permission });
    }

    return undefined;
  };
}
