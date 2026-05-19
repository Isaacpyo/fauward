import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient, type Tenant } from '@prisma/client';
import { tenantStorage, runWithTenantContext } from '../../context/tenant.context.js';
import { DomainBusinessError, assertDomainIsAllowed, normalizeDomainInput } from './domain.validator.js';
import {
  VercelApiError,
  VercelClient,
  VercelDomainAlreadyTakenError,
  type VercelDomainConfig,
  type VercelProjectDomain
} from './infrastructure/vercel.client.js';

export type DomainStatus = 'NONE' | 'PENDING_DNS' | 'VERIFYING' | 'ACTIVE' | 'FAILED';

export type DomainDnsRecord = {
  type: string;
  name: string;
  host: string;
  value: string;
  ttl: number;
  reason?: string;
};

export type DomainStatusResult = {
  status: DomainStatus;
  domain: string | null;
  instructions: DomainDnsRecord | null;
  records: DomainDnsRecord[];
  error: string | null;
  verifiedAt?: Date | null;
  lastCheckAt?: Date | null;
};

export class DomainConflictError extends Error {
  code = 'DOMAIN_TAKEN';
}

export class DomainNotFoundError extends Error {
  code = 'DOMAIN_NOT_FOUND';
}

type DomainAuditArgs = {
  tenantId: string;
  actorUserId?: string | null;
  actorIp?: string | null;
  actorType?: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
};

type DomainMutationArgs = {
  tenantId: string;
  actorUserId?: string | null;
  actorIp?: string | null;
  actorType?: string;
};

type DomainSetArgs = DomainMutationArgs & {
  domain: string;
};

type DomainClient = Pick<VercelClient, 'addDomain' | 'getDomain' | 'verifyDomain' | 'getDomainConfig' | 'removeDomain'>;

const FALLBACK_CNAME_TARGET = 'cname.vercel-dns.com';
const GENERIC_UPSTREAM_ERROR = 'Unable to verify the domain with Vercel right now.';

function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function recommendedCname(config: VercelDomainConfig | null) {
  return config?.recommendedCNAME?.sort((a, b) => a.rank - b.rank)[0]?.value ?? FALLBACK_CNAME_TARGET;
}

function canUseCname(config: VercelDomainConfig | null) {
  return config?.configuredBy === 'CNAME' && config.misconfigured !== true;
}

function relativeRecordName(host: string, domain: string) {
  const apex = domain.split('.').slice(1).join('.');
  if (host === domain) return domain.split('.')[0];
  if (apex && host.endsWith(`.${apex}`)) return host.slice(0, -(apex.length + 1));
  return host;
}

function verificationRecords(domain: string, projectDomain: VercelProjectDomain | null): DomainDnsRecord[] {
  return (projectDomain?.verification ?? []).map((challenge) => ({
    type: challenge.type.toUpperCase(),
    name: relativeRecordName(challenge.domain, domain),
    host: challenge.domain,
    value: challenge.value,
    ttl: 3600,
    reason: challenge.reason
  }));
}

function uniqueRecords(records: DomainDnsRecord[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.type}:${record.host}:${record.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class DomainService {
  constructor(private readonly vercel: DomainClient = new VercelClient()) {}

  async setCustomDomain(prisma: PrismaClient, args: DomainSetArgs) {
    const domain = normalizeDomainInput(args.domain);
    assertDomainIsAllowed(domain);

    const existing = await prisma.tenant.findUnique({ where: { id: args.tenantId } });
    if (!existing) throw new DomainNotFoundError('Tenant not found');

    if (existing.customDomain === domain && existing.customDomainStatus !== 'FAILED') {
      const projectDomain = await this.vercel.getDomain(domain).catch(() => null);
      return {
        tenant: existing,
        instructions: this.dnsInstructions(domain, FALLBACK_CNAME_TARGET),
        records: this.dnsRecords(domain, FALLBACK_CNAME_TARGET, projectDomain)
      };
    }

    if (existing.customDomain && existing.customDomain !== domain) {
      await this.vercel.removeDomain(existing.customDomain).catch(() => undefined);
    }

    let added: VercelProjectDomain;
    let addedByThisRequest = false;
    try {
      added = await this.vercel.addDomain(domain);
      addedByThisRequest = true;
    } catch (error) {
      if (error instanceof VercelDomainAlreadyTakenError) {
        try {
          added = await this.vercel.getDomain(domain);
        } catch {
          throw new DomainConflictError('This domain is already in use by another Fauward tenant.');
        }
      } else {
        throw error;
      }
    }

    let config: VercelDomainConfig | null = null;
    try {
      config = await this.vercel.getDomainConfig(domain);
    } catch {
      config = null;
    }

    try {
      const tenant = await this.withTenantContext(existing, () =>
        prisma.$transaction(async (tx) => {
          const updated = await tx.tenant.update({
            where: { id: args.tenantId },
            data: {
              customDomain: domain,
              domainVerified: false,
              customDomainStatus: 'PENDING_DNS',
              customDomainAddedAt: new Date(),
              customDomainVerifiedAt: null,
              customDomainLastCheckAt: null,
              customDomainError: null,
              customDomainVerificationToken: randomBytes(16).toString('hex'),
              customDomainVercelId: added.projectId ?? null
            }
          });

          await this.writeAudit(tx as PrismaClient, {
            tenantId: args.tenantId,
            actorUserId: args.actorUserId ?? null,
            actorIp: args.actorIp ?? null,
            actorType: args.actorType ?? 'USER',
            action: 'tenant.custom_domain.set',
            target: domain,
            metadata: { previousDomain: existing.customDomain, verification: added.verification ?? [] }
          });

          return updated;
        })
      );

      return {
        tenant,
        instructions: this.dnsInstructions(domain, recommendedCname(config)),
        records: this.dnsRecords(domain, recommendedCname(config), added)
      };
    } catch (error) {
      if (addedByThisRequest) {
        await this.vercel.removeDomain(domain).catch(() => undefined);
      }
      if (isUniqueConstraintError(error)) {
        throw new DomainConflictError('This domain is already in use by another Fauward tenant.');
      }
      throw error;
    }
  }

  async checkStatus(prisma: PrismaClient, tenantId: string): Promise<DomainStatusResult> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new DomainNotFoundError('Tenant not found');
    if (!tenant.customDomain) {
      return {
        status: 'NONE',
        domain: null,
        instructions: null,
        records: [],
        error: null,
        verifiedAt: null,
        lastCheckAt: null
      };
    }

    let nextStatus: DomainStatus = tenant.customDomainStatus as DomainStatus;
    let errorMessage: string | null = null;
    let projectDomain: VercelProjectDomain | null = null;
    let config: VercelDomainConfig | null = null;

    try {
      try {
        projectDomain = await this.vercel.verifyDomain(tenant.customDomain);
      } catch {
        projectDomain = await this.vercel.getDomain(tenant.customDomain);
      }
      config = await this.vercel.getDomainConfig(tenant.customDomain);

      const pendingVerificationRecords = verificationRecords(tenant.customDomain, projectDomain).length > 0;

      if (projectDomain.verified && canUseCname(config)) {
        nextStatus = 'ACTIVE';
      } else if (pendingVerificationRecords) {
        nextStatus = 'PENDING_DNS';
      } else if (canUseCname(config)) {
        nextStatus = 'VERIFYING';
      } else {
        nextStatus = 'PENDING_DNS';
      }
    } catch (error) {
      nextStatus = 'FAILED';
      errorMessage = GENERIC_UPSTREAM_ERROR;
      if (error instanceof VercelApiError) {
        errorMessage = 'Unable to verify the domain with Vercel right now.';
      }
    }

    const previous = tenant.customDomainStatus;
    const updated = await this.withTenantContext(tenant, () =>
      prisma.$transaction(async (tx) => {
        const row = await tx.tenant.update({
          where: { id: tenantId },
          data: {
            domainVerified: nextStatus === 'ACTIVE',
            customDomainStatus: nextStatus,
            customDomainLastCheckAt: new Date(),
            customDomainVerifiedAt:
              nextStatus === 'ACTIVE'
                ? previous !== 'ACTIVE'
                  ? new Date()
                  : tenant.customDomainVerifiedAt
                : null,
            customDomainError: errorMessage
          }
        });

        if (previous !== nextStatus) {
          await this.writeAudit(tx as PrismaClient, {
            tenantId,
            actorUserId: null,
            actorIp: null,
            actorType: 'SYSTEM',
            action: 'tenant.custom_domain.status_changed',
            target: tenant.customDomain!,
            metadata: { from: previous, to: nextStatus, error: errorMessage }
          });
        }

        return row;
      })
    );

    return {
      status: nextStatus,
      domain: tenant.customDomain,
      instructions: this.dnsInstructions(tenant.customDomain, recommendedCname(config)),
      records: this.dnsRecords(tenant.customDomain, recommendedCname(config), projectDomain),
      error: errorMessage,
      verifiedAt: updated.customDomainVerifiedAt,
      lastCheckAt: updated.customDomainLastCheckAt
    };
  }

  async removeCustomDomain(prisma: PrismaClient, args: DomainMutationArgs) {
    const tenant = await prisma.tenant.findUnique({ where: { id: args.tenantId } });
    if (!tenant) throw new DomainNotFoundError('Tenant not found');
    if (!tenant.customDomain) return tenant;

    await this.vercel.removeDomain(tenant.customDomain).catch(() => undefined);

    return this.withTenantContext(tenant, () =>
      prisma.$transaction(async (tx) => {
        const updated = await tx.tenant.update({
          where: { id: args.tenantId },
          data: {
            customDomain: null,
            domainVerified: false,
            customDomainStatus: 'NONE',
            customDomainAddedAt: null,
            customDomainVerifiedAt: null,
            customDomainLastCheckAt: null,
            customDomainError: null,
            customDomainVerificationToken: null,
            customDomainVercelId: null
          }
        });

        await this.writeAudit(tx as PrismaClient, {
          tenantId: args.tenantId,
          actorUserId: args.actorUserId ?? null,
          actorIp: args.actorIp ?? null,
          actorType: args.actorType ?? 'USER',
          action: 'tenant.custom_domain.removed',
          target: tenant.customDomain!,
          metadata: { previousStatus: tenant.customDomainStatus }
        });

        return updated;
      })
    );
  }

  private dnsInstructions(domain: string, value: string): DomainDnsRecord {
    return {
      type: 'CNAME',
      name: domain.split('.')[0],
      host: domain,
      value,
      ttl: 3600
    };
  }

  private dnsRecords(domain: string, cnameValue: string, projectDomain: VercelProjectDomain | null): DomainDnsRecord[] {
    return uniqueRecords([
      this.dnsInstructions(domain, cnameValue),
      ...verificationRecords(domain, projectDomain)
    ]);
  }

  private async withTenantContext<T>(tenant: Tenant, fn: () => Promise<T>) {
    if (tenantStorage.getStore()) return fn();
    return runWithTenantContext(
      {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        plan: tenant.plan,
        region: tenant.region,
        isSuperAdmin: false
      },
      fn
    );
  }

  private writeAudit(prisma: PrismaClient, args: DomainAuditArgs) {
    return prisma.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorId: args.actorUserId ?? null,
        actorType: args.actorType ?? 'USER',
        actorIp: args.actorIp ?? null,
        action: args.action,
        resourceType: 'TENANT_CUSTOM_DOMAIN',
        resourceId: args.target,
        metadata: (args.metadata ?? {}) as Prisma.InputJsonValue
      }
    });
  }
}

export { DomainBusinessError };
export const domainService = new DomainService();
