import type { FastifyReply, FastifyRequest } from 'fastify';
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

function isPlatformDomain(host: string, platformDomain: string): boolean {
  const normalized = normalizeHost(host);
  const domain = platformDomain.toLowerCase();
  return normalized === domain || RESERVED_SUBDOMAINS.has(normalized.replace(`.${domain}`, ''));
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

async function resolveTrackingTenant(req: FastifyRequest, path: string) {
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
    const bySlug = await req.server.prisma.tenant.findUnique({ where: { slug: identifier } });
    if (bySlug) return bySlug;
  }

  const slug = extractSlugFromHost(hostHeader, config.platformDomain);
  if (slug) {
    const byHostSlug = await req.server.prisma.tenant.findUnique({ where: { slug } });
    if (byHostSlug) return byHostSlug;
  }

  return null;
}

export async function tenantResolver(req: FastifyRequest, reply: FastifyReply): Promise<TenantContext | null> {
  const path = req.url.split('?')[0];
  const hostHeader = req.headers.host ?? '';
  const host = normalizeHost(hostHeader);

  if (SYSTEM_PATHS.has(path)) {
    return systemContext();
  }

  if (path.startsWith('/api/v1/tracking/')) {
    const tenant = await resolveTrackingTenant(req, path);
    if (!tenant) {
      reply.status(404).send({ error: 'Business not found', code: 'TENANT_NOT_FOUND' });
      return null;
    }
    req.tenant = tenant;
    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      plan: tenant.plan,
      region: tenant.region,
      isSuperAdmin: false
    };
  }

  if (PUBLIC_PATHS.has(path)) {
    const byCustomDomain = await findActiveTenantByCustomDomain(req, host);
    if (byCustomDomain) {
      req.tenant = byCustomDomain;
      return {
        tenantId: byCustomDomain.id,
        tenantSlug: byCustomDomain.slug,
        plan: byCustomDomain.plan,
        region: byCustomDomain.region,
        isSuperAdmin: false
      };
    }

    const tenantSlugFromQuery = typeof req.query === 'object' ? (req.query as { tenant?: string }).tenant : undefined;
    if (typeof tenantSlugFromQuery === 'string' && tenantSlugFromQuery.trim().length > 0) {
      const tenant = await req.server.prisma.tenant.findUnique({ where: { slug: tenantSlugFromQuery.trim() } });
      if (tenant) {
        req.tenant = tenant;
        return {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          plan: tenant.plan,
          region: tenant.region,
          isSuperAdmin: false
        };
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

  let tenant = null;

  if (host) {
    tenant = await findActiveTenantByCustomDomain(req, host);
  }

  if (isPlatformDomain(host, config.platformDomain)) {
    return systemContext();
  }

  const slug = extractSlugFromHost(host, config.platformDomain);
  if (!tenant && slug) {
    tenant = await req.server.prisma.tenant.findUnique({ where: { slug } });
  }

  const headerSlug = req.headers['x-tenant-slug'];
  if (!tenant && typeof headerSlug === 'string') {
    tenant = await req.server.prisma.tenant.findUnique({ where: { slug: headerSlug } });
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

  const ctx: TenantContext = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    plan: tenant.plan,
    region: tenant.region,
    isSuperAdmin: false
  };
  return ctx;
}
