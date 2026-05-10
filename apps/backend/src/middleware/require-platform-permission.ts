import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PlatformPermission } from '../services/platform-permission.service.js';
import { platformRoleHasPermission } from '../services/platform-permission.service.js';

export function requirePlatformPermission(permission: PlatformPermission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.platform?.user.role;
    if (!role || !platformRoleHasPermission(role, permission)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}

export function requireAnyPlatformPermission(permissions: PlatformPermission[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.platform?.user.role;
    if (!role || !permissions.some((permission) => platformRoleHasPermission(role, permission))) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}
