import type { FastifyReply, FastifyRequest } from 'fastify';

const FRESH_MFA_WINDOW_MS = 10 * 60 * 1000;

export async function requireFreshPlatformMfa(request: FastifyRequest, reply: FastifyReply) {
  const mfaVerifiedAt = request.platform?.session.mfaVerifiedAt;
  if (!mfaVerifiedAt || Date.now() - mfaVerifiedAt.getTime() > FRESH_MFA_WINDOW_MS) {
    return reply.status(403).send({
      error: 'MFA_REQUIRED',
      message: 'Fresh MFA verification is required for this action.'
    });
  }
}
