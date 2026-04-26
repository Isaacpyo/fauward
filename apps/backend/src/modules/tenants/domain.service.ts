import type { PrismaClient } from '@prisma/client';
import dns from 'dns/promises';

function isValidDomain(domain: string) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

function normalizeDomain(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function buildCname(domain: string) {
  return { host: domain, value: 'cname.fauward.com', type: 'CNAME' };
}

export const domainService = {
  async setCustomDomain(prisma: PrismaClient, tenantId: string, domain: string) {
    const normalizedDomain = normalizeDomain(domain);

    if (!isValidDomain(normalizedDomain)) {
      throw { statusCode: 400, error: 'Invalid domain format' };
    }

    const existing = await prisma.tenant.findFirst({
      where: { customDomain: normalizedDomain, id: { not: tenantId } }
    });
    if (existing) {
      throw { statusCode: 409, error: 'Domain already in use' };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomain: normalizedDomain, domainVerified: false }
    });

    return {
      domain: normalizedDomain,
      cname: buildCname(normalizedDomain),
      status: 'PENDING_DNS'
    };
  },

  async checkDomainVerification(prisma: PrismaClient, tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.customDomain) {
      return { status: 'NOT_CONFIGURED', domain: null, cname: null };
    }
    if (tenant.domainVerified) {
      return { status: 'ACTIVE', domain: tenant.customDomain, cname: buildCname(tenant.customDomain) };
    }

    try {
      const records = await dns.resolveCname(tenant.customDomain);
      const pointsToUs = records.some((r) => r.endsWith('fauward.com') || r.endsWith('cloudfront.net'));

      if (pointsToUs) {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { domainVerified: true }
        });
        return { status: 'ACTIVE', domain: tenant.customDomain, cname: buildCname(tenant.customDomain) };
      }
      return { status: 'PENDING_DNS', domain: tenant.customDomain, cname: buildCname(tenant.customDomain) };
    } catch {
      return { status: 'PENDING_DNS', domain: tenant.customDomain, cname: buildCname(tenant.customDomain) };
    }
  }
};
