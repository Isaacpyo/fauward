import type { FastifyRequest } from 'fastify';
import { getTenantEntitlements, type TenantEntitlements } from '../../services/tenant-entitlements.service.js';

/** The request tenant's entitlements, loaded once per request (Redis-cached across requests). Null without a tenant. */
export async function loadRequestEntitlements(request: FastifyRequest): Promise<TenantEntitlements | null> {
  if (request.entitlements) return request.entitlements;
  const tenant = request.tenant;
  if (!tenant) return null;
  request.entitlements = await getTenantEntitlements({ prisma: request.server.prisma, redis: request.server.redis, log: request.log }, tenant);
  return request.entitlements;
}
