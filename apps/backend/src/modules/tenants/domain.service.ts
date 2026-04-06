import type { PrismaClient } from '@prisma/client';
import dns from 'dns/promises';

function isValidDomain(domain: string) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

export const domainService = {
  async setCustomDomain(prisma: PrismaClient, tenantId: string, domain: string) {
    if (!isValidDomain(domain)) {
      throw { statusCode: 400, error: 'Invalid domain format' };
    }

    const existing = await prisma.tenant.findFirst({
      where: { customDomain: domain, id: { not: tenantId } }
    });
    if (existing) {
      throw { statusCode: 409, error: 'Domain already in use' };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomain: domain, domainVerified: false }
    });

    return {
      domain,
      cname: { host: domain, value: 'fauward.com', type: 'CNAME' },
      status: 'PENDING_DNS'
    };
  },

  async checkDomainVerification(prisma: PrismaClient, tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.customDomain) {
      throw { statusCode: 400, error: 'No custom domain set' };
    }
    if (tenant.domainVerified) {
      return { status: 'ACTIVE', domain: tenant.customDomain };
    }

    try {
      const records = await dns.resolveCname(tenant.customDomain);
      const pointsToUs = records.some((r) => r.endsWith('fauward.com') || r.endsWith('cloudfront.net'));

      if (pointsToUs) {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { domainVerified: true }
        });
        return { status: 'ACTIVE', domain: tenant.customDomain };
      }
      return { status: 'PENDING_DNS', domain: tenant.customDomain };
    } catch {
      return { status: 'PENDING_DNS', domain: tenant.customDomain };
    }
  }
};