import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Tenant } from '@prisma/client';
import { config } from '../../config/index.js';
import type { TenantContext } from '../../context/tenant.context.js';

function normalizeHost(host: string) {
  return host.split(':')[0].toLowerCase();
}

const RESERVED_SUBDOMAINS = new Set(['api', 'admin', 'app', 'www', 'mail', 'smtp', 'ftp', 'cdn', 'status', 'docs']);

function extractSlugFromHost(host: string, platformDomain: string) {
  const normalized = normalizeHost(host);
  const suffix = `.${platformDomain.toLowerCase()}`;
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  if (!slug || RESERVED_SUBDOMAINS.has(slug)) return null;
  return slug;
}

type TenantSlugSource = 'path' | 'header' | 'subdomain' | 'query';

function isPlatformDomain(host: string, platformDomain: string): boolean {
  const normalized = normalizeHost(host);
  const domain = platformDomain.toLowerCase();
  if (normalized === domain) return true;
  if (!normalized.endsWith(`.${domain}`)) return false;
  const subdomain = normalized.slice(0, -(domain.length + 1));
  return RESERVED_SUBDOMAINS.has(subdomain);
}

const PUBLIC_PATHS = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/firebase-login',
  '/api/v1/auth/email-link/request',
  '/api/v1/auth/email-link/consume',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/me',
  '/api/v1/auth/mfa/validate',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/tenant/region-change-requests/dev',
  '/api/v1/payments/webhook/stripe'
]);

const SYSTEM_PATHS = new Set([
  '/health',
  '/live',
  '/ready',
  '/version'
]);

function systemContext(): TenantContext {
  return {
    tenantId: 'system',
    tenantSlug: 'system',
    plan: 'SYSTEM',
    region: 'global',
    isSuperAdmin: true
  };
}

function getTrackingTenantIdentifier(query: unknown): string | null {
  if (!query || typeof query !== 'object') return null;
  const q = query as Record<string, unknown>;
  const value = q.tenantId ?? q.tenant_id ?? q.tenant ?? q.tenantSlug;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function findActiveTenantByCustomDomain(req: FastifyRequest, host: string) {
  if (!host) return null;
  return req.server.prisma.tenant.findFirst({
    where: { customDomain: host, customDomainStatus: 'ACTIVE' }
  });
}

function extractSlugFromPath(path: string) {
  const match = path.match(/^\/api\/v1\/t\/([^/]+)/);
  return match?.[1]?.toLowerCase() ?? null;
}

function tenantContext(tenant: Tenant): TenantContext {
  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    plan: tenant.plan,
    region: tenant.region,
    isSuperAdmin: false
  };
}

async function resolveTenantBySlug(
  req: FastifyRequest,
  reply: FastifyReply,
  slug: string,
  source: TenantSlugSource,
  path: string
): Promise<Tenant | null> {
  const normalizedSlug = slug.toLowerCase();
  const tenant = await req.server.prisma.tenant.findUnique({ where: { slug: normalizedSlug } });
  if (tenant) return tenant;

  const historical = await req.server.prisma.tenantSlugHistory.findUnique({
    where: { oldSlug: normalizedSlug },
    include: { tenant: true }
  });
  if (!historical || historical.expiresAt <= new Date()) return null;

  if (source === 'path') {
    const location = path.replace(`/t/${slug}`, `/t/${historical.tenant.slug}`);
    reply.status(301).header('Location', location).send();
    return null;
  }

  reply.header('X-Tenant-Slug-Deprecated', normalizedSlug);
  reply.header('X-Tenant-Slug-Current', historical.tenant.slug);
  return historical.tenant;
}

async function resolveTrackingTenant(req: FastifyRequest, reply: FastifyReply, path: string) {
  if (!path.startsWith('/api/v1/tracking/')) return null;

  const hostHeader = req.headers.host ?? '';
  const host = normalizeHost(hostHeader);
  if (host) {
    const byCustomDomain = await findActiveTenantByCustomDomain(req, host);
    if (byCustomDomain) return byCustomDomain;
  }

  const identifier = getTrackingTenantIdentifier(req.query);
  if (identifier) {
    const byId = await req.server.prisma.tenant.findUnique({ where: { id: identifier } });
    if (byId) return byId;
    const bySlug = await resolveTenantBySlug(req, reply, identifier, 'query', path);
    if (bySlug) return bySlug;
  }

  const slug = extractSlugFromHost(hostHeader, config.platformDomain);
  if (slug) {
    const byHostSlug = await resolveTenantBySlug(req, reply, slug, 'subdomain', path);
    if (byHostSlug) return byHostSlug;
  }

  return null;
}

export async function tenantResolver(req: FastifyRequest, reply: FastifyReply): Promise<TenantContext | null> {
  const path = req.url.split('?')[0];
  const hostHeader = req.headers.host ?? '';
  const host = normalizeHost(hostHeader);
  const pathSlug = extractSlugFromPath(path);

  if (SYSTEM_PATHS.has(path)) {
    return systemContext();
  }

  if (path.startsWith('/api/v1/tracking/')) {
    const tenant = await resolveTrackingTenant(req, reply, path);
    if (!tenant) {
      reply.status(404).send({ error: 'Business not found', code: 'TENANT_NOT_FOUND' });
      return null;
    }
    req.tenant = tenant;
    return tenantContext(tenant);
  }

  if (PUBLIC_PATHS.has(path)) {
    const byCustomDomain = await findActiveTenantByCustomDomain(req, host);
    if (byCustomDomain) {
      req.tenant = byCustomDomain;
      return tenantContext(byCustomDomain);
    }

    const tenantSlugFromQuery = typeof req.query === 'object' ? (req.query as { tenant?: string }).tenant : undefined;
    if (typeof tenantSlugFromQuery === 'string' && tenantSlugFromQuery.trim().length > 0) {
      const tenant = await resolveTenantBySlug(req, reply, tenantSlugFromQuery.trim(), 'query', path);
      if (tenant) {
        req.tenant = tenant;
        return tenantContext(tenant);
      }
    }

    return systemContext();
  }

  if (path.startsWith('/api/v1/platform') || path.startsWith('/api/v1/admin') || path.startsWith('/api/v1/relay') || path.startsWith('/api/internal/')) {
    return systemContext();
  }

  // Agent handle-event is a service-to-service endpoint authenticated by service token.
  // Tenant context comes from the request body, not the hostname.
  if (path === '/v1/agent/handle-event') {
    return systemContext();
  }

  let tenant: Tenant | null = null;

  if (pathSlug) {
    tenant = await resolveTenantBySlug(req, reply, pathSlug, 'path', path);
    if (!tenant && reply.sent) return null;
  }

  const headerSlug = req.headers['x-tenant-slug'];
  if (!tenant && typeof headerSlug === 'string' && headerSlug.trim().length > 0) {
    tenant = await resolveTenantBySlug(req, reply, headerSlug.trim(), 'header', path);
  }

  if (!tenant && host) {
    tenant = await findActiveTenantByCustomDomain(req, host);
  }

  if (!tenant && isPlatformDomain(host, config.platformDomain)) {
    return systemContext();
  }

  const slug = extractSlugFromHost(host, config.platformDomain);
  if (!tenant && slug) {
    tenant = await resolveTenantBySlug(req, reply, slug, 'subdomain', path);
  }

  if (!tenant) {
    reply.status(404).send({ error: 'Business not found', code: 'TENANT_NOT_FOUND' });
    return null;
  }

  if (tenant.status === 'CANCELLED') {
    reply.status(410).send({ error: 'Account cancelled', code: 'TENANT_CANCELLED' });
    return null;
  }

  req.tenant = tenant;

  return tenantContext(tenant);
}
