import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Permission } from '@fauward/internal-rbac';
import { consolePermissionContext } from '../services/staff-iam.service.js';

export type ConsoleRequestContext = Awaited<ReturnType<typeof consolePermissionContext>>;

/**
 * The caller's effective console permissions (role permissions ∪ active JIT grants), computed once per request and
 * cached on `request.console` (D2, architecture §4).
 */
export async function loadConsoleContext(request: FastifyRequest) {
  if (!request.console) {
    request.console = await consolePermissionContext(request.server.prisma, request.platform!.user);
  }
  return request.console;
}

function allow(request: FastifyRequest, context: ConsoleRequestContext, permission: Permission) {
  if (context.rolePermissions.has(permission)) return true;
  const grant = context.jit.get(permission);
  if (!grant) return false;
  request.jitSessionId = grant.id;
  return true;
}

/** Route guard: 401 without a console session, 403 `{ error: 'Forbidden', permission }` without the permission. */
export function requireConsolePermission(permission: Permission) {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.platform?.user) return reply.status(401).send({ error: 'Unauthorized' });
    const context = await loadConsoleContext(request);
    if (allow(request, context, permission)) return undefined;
    return reply.status(403).send({ error: 'Forbidden', permission });
  };
  // Tagged so the rbac-matrix test can read the permission off a registered route.
  return Object.assign(guard, { consolePermissions: [permission] as readonly Permission[] });
}

/** Read routes shared by two services: any one of the permissions is enough. */
export function requireAnyConsolePermission(permissions: readonly Permission[]) {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.platform?.user) return reply.status(401).send({ error: 'Unauthorized' });
    const context = await loadConsoleContext(request);
    if (permissions.some((permission) => allow(request, context, permission))) return undefined;
    return reply.status(403).send({ error: 'Forbidden', permission: permissions[0], permissions });
  };
  return Object.assign(guard, { consolePermissions: permissions });
}

/** In-handler check with the same rule as the guards (e.g. write-scope impersonation needs `.mutate`). */
export async function consoleUserHas(request: FastifyRequest, permission: Permission) {
  if (!request.platform?.user) return false;
  return allow(request, await loadConsoleContext(request), permission);
}
