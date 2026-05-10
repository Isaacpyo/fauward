import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyPlatformCsrf } from '../services/platform-session.service.js';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function requirePlatformCsrf(request: FastifyRequest, reply: FastifyReply) {
  if (!mutationMethods.has(request.method)) return;

  if (!verifyPlatformCsrf(request.headers['x-csrf-token'], request.cookies ?? {})) {
    return reply.status(403).send({ error: 'CSRF_REQUIRED', message: 'Missing or invalid CSRF token.' });
  }
}
