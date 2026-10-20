import type { FastifyReply, FastifyRequest } from 'fastify';

export const FRESH_MFA_WINDOW_MS = 10 * 60 * 1000;

// Enrolment-aware fresh-MFA guard (architecture §2.4).
export async function requireFreshMfa(request: FastifyRequest, reply: FastifyReply) {
  const platform = request.platform;
  if (!platform) return reply.status(401).send({ error: 'Unauthorized' });

  if (!platform.user.mfaEnabled) {
    return reply.status(403).send({
      error: 'MFA_ENROLLMENT_REQUIRED',
      message: 'Enrol an authenticator app before performing this action.'
    });
  }

  const mfaVerifiedAt = platform.session.mfaVerifiedAt;
  if (!mfaVerifiedAt || Date.now() - mfaVerifiedAt.getTime() > FRESH_MFA_WINDOW_MS) {
    return reply.status(403).send({
      error: 'MFA_REQUIRED',
      stepUp: true,
      message: 'Fresh MFA verification is required for this action.'
    });
  }
}

/** @deprecated Use requireFreshMfa. Alias kept until WP-1.1. */
export const requireFreshPlatformMfa = requireFreshMfa;
