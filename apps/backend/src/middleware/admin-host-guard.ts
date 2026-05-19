import type { FastifyReply, FastifyRequest } from 'fastify';

const DEFAULT_ADMIN_ROUTE_PREFIXES = [
  '/admin',
  '/api/internal',
  '/api/v1/platform',
  '/api/v1/admin'
];

type AdminHostGuardOptions = {
  enabled: boolean;
  adminHostname: string;
  adminRoutePrefixes?: string[];
};

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
    if (!options.enabled || !isAdminRoutePath(request.url, prefixes)) return;

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
