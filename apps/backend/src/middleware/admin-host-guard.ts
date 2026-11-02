import type { FastifyReply, FastifyRequest } from 'fastify';
import { isVendorWebhookPath, requestPath } from '../config/vendor-webhooks.js';

const DEFAULT_ADMIN_ROUTE_PREFIXES = [
  '/admin',
  '/api/internal',
  '/api/v1/platform'
];

type AdminHostGuardOptions = {
  enabled: boolean;
  adminHostname: string;
  adminRoutePrefixes?: string[];
};

/** Monitoring endpoints (MONITORING_API_KEY bearer, S8) called by the status dashboard and the Python services. */
const MONITORING_PREFIX = '/api/internal/metrics';

/**
 * Paths under the admin prefixes that must keep working on the API host (S15, WP-5.5): vendor webhooks (each verifies
 * its own signature and posts to api.fauward.com) and the monitoring endpoints.
 */
export function isHostAgnosticPath(url: string | undefined) {
  const path = requestPath(url);
  return isVendorWebhookPath(path) || pathMatchesPrefix(path, MONITORING_PREFIX);
}

export function normalizeRequestHost(host: string | undefined) {
  if (!host) return '';
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const closingBracket = trimmed.indexOf(']');
    return closingBracket === -1 ? trimmed : trimmed.slice(1, closingBracket);
  }
  return trimmed.split(':')[0];
}

function pathMatchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isAdminRoutePath(url: string | undefined, prefixes = DEFAULT_ADMIN_ROUTE_PREFIXES) {
  const path = (url ?? '').split('?')[0];
  return prefixes.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function createAdminHostGuard(options: AdminHostGuardOptions) {
  const adminHostname = normalizeRequestHost(options.adminHostname);
  const prefixes = options.adminRoutePrefixes ?? DEFAULT_ADMIN_ROUTE_PREFIXES;

  return async function adminHostGuard(request: FastifyRequest, reply: FastifyReply) {
    if (!options.enabled || !isAdminRoutePath(request.url, prefixes) || isHostAgnosticPath(request.url)) return;

    const requestHost = normalizeRequestHost(request.headers.host);
    if (requestHost === adminHostname) return;

    request.log.warn(
      { host: requestHost || null, path: request.url.split('?')[0] },
      'Blocked admin route request on non-admin hostname'
    );

    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found'
    });
  };
}
