import type { FastifyReply, FastifyRequest } from 'fastify';

const suspensionMessage = 'This tenant is currently suspended. Contact support.';

const readOnlyAllowedPrefixes = ['/api/v1/tracking/'];
const blockedMutationPrefixes = [
  '/api/v1/shipments',
  '/api/v1/users',
  '/api/v1/tenant',
  '/api/v1/api-keys',
  '/api/v1/webhooks',
  '/api/v1/pricing',
  '/api/v1/payments',
  '/api/v1/documents',
  '/api/v1/returns',
  '/api/v1/support',
  '/api/v1/fleet',
  '/api/v1/finance'
];

export async function enforceTenantStatus(request: FastifyRequest, reply: FastifyReply) {
  const tenant = request.tenant;
  if (!tenant || tenant.status !== 'SUSPENDED') return;

  const path = request.url.split('?')[0];
  if (path.startsWith('/api/v1/platform') || readOnlyAllowedPrefixes.some((prefix) => path.startsWith(prefix))) {
    return;
  }

  const isBlockedMutation =
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
    blockedMutationPrefixes.some((prefix) => path.startsWith(prefix));

  if (isBlockedMutation || !path.startsWith('/api/v1/tracking/')) {
    return reply.status(403).send({
      error: 'TENANT_SUSPENDED',
      message: suspensionMessage
    });
  }
}
