import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requirePlatformReason(request: FastifyRequest, reply: FastifyReply) {
  const reason = (request.body as { reason?: unknown } | undefined)?.reason;
  if (typeof reason !== 'string' || reason.trim().length < 8) {
    return reply.status(400).send({
      error: 'REASON_REQUIRED',
      message: 'A reason of at least 8 characters is required for this platform action.'
    });
  }
}
