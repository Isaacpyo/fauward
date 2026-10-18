import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Permission } from '@fauward/internal-rbac';
import { authenticatePlatformSession } from './authenticate-platform-session.js';
import { requirePlatformCsrf } from './require-platform-csrf.js';
import { requireFreshMfa } from './require-fresh-platform-mfa.js';
import { requireInternalPermission } from './require-internal-permission.js';

export type ReasonGuard = ((request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>) & { reasonGuard: true; minLength: number };

/** 400 REASON_REQUIRED unless the body carries a reason of at least `minLength` characters. */
export function requireReason(minLength = 8): ReasonGuard {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    const reason = (request.body as { reason?: unknown } | undefined)?.reason;
    if (typeof reason !== 'string' || reason.trim().length < minLength) {
      return reply.status(400).send({ error: 'REASON_REQUIRED', message: `A reason of at least ${minLength} characters is required for this action.` });
    }
    return undefined;
  };
  return Object.assign(guard, { reasonGuard: true as const, minLength });
}

/** Pre-handler chain for every `D:` route in the service catalogue (architecture §9.2). */
export function dangerous(permission: Permission, opts?: { minReason?: number }) {
  return [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission(permission), requireFreshMfa, requireReason(opts?.minReason ?? 8)];
}
