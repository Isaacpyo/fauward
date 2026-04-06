import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import type { TenantContext } from '../../context/tenant.context.js';

function normalizeHost(host: string) {
  return host.split(':')[0].toLowerCase();
}

function extractSlugFromHost(host: string, platformDomain: string) {
  const normalized = normalizeHost(host);
  const suffix = `.${platformDomain.toLowerCase()}`;
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  if (!slug || slug === 'api' || slug === 'admin') return null;
  return slug;
}

const PUBLIC_PATHS = new Set([
  '/health',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/mfa/validate',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/payments/webhook/stripe'
]);

export async function tenantResolver(req: FastifyRequest, reply: FastifyReply): Promise<TenantContext | null> {
  const path = req.url.split('?')[0];
  if (PUBLIC_PATHS.has(path) || path.startsWith('/api/v1/tracking/')) {
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

    const ctx: TenantContext = {
      tenantId: 'system',
      tenantSlug: 'system',
      plan: 'SYSTEM',
      region: 'global',
      isSuperAdmin: true
    };
    return ctx;
  }

  if (path.startsWith('/api/v1/admin')) {
    return {
      tenantId: 'system',
      tenantSlug: 'system',
      plan: 'SYSTEM',
      region: 'global',
      isSuperAdmin: true
    };
  }

  const hostHeader = req.headers.host ?? '';
  const host = normalizeHost(hostHeader);

  let tenant = null;

  const slug = extractSlugFromHost(host, config.platformDomain);
  if (slug) {
    tenant = await req.server.prisma.tenant.findUnique({ where: { slug } });
  }

  if (!tenant && host && !host.endsWith(config.platformDomain.toLowerCase())) {
    tenant = await req.server.prisma.tenant.findFirst({
      where: { customDomain: host, domainVerified: true }
    });
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
