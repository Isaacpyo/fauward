import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainBusinessError, DomainConflictError, DomainService } from './domain.service.js';
import { VercelDomainAlreadyTakenError } from './infrastructure/vercel.client.js';

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-a',
    slug: 'tenant-a',
    name: 'Tenant A',
    region: 'uk_europe',
    plan: 'PRO',
    status: 'ACTIVE',
    customDomain: null,
    domainVerified: false,
    customDomainStatus: 'NONE',
    customDomainVerifiedAt: null,
    customDomainLastCheckAt: null,
    customDomainError: null,
    ...overrides
  };
}

function buildContext(existing = tenant()) {
  const updatedRows: unknown[] = [];
  const auditRows: unknown[] = [];
  const tx = {
    tenant: {
      update: vi.fn(async ({ data }: any) => {
        const row = { ...existing, ...data };
        updatedRows.push(row);
        return row;
      })
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        auditRows.push(data);
        return { id: `audit-${auditRows.length}`, ...data };
      })
    }
  };
  const prisma = {
    tenant: {
      findUnique: vi.fn(async () => existing)
    },
    $transaction: vi.fn(async (callback: any) => callback(tx))
  };
  const vercel = {
    addDomain: vi.fn(async (domain: string): Promise<any> => ({ name: domain, verified: false, projectId: 'prj_123' })),
    getDomain: vi.fn(async (domain: string): Promise<any> => ({ name: domain, verified: false })),
    verifyDomain: vi.fn(async (domain: string): Promise<any> => ({ name: domain, verified: false })),
    getDomainConfig: vi.fn(async () => ({
      configuredBy: 'CNAME',
      misconfigured: false,
      recommendedCNAME: [{ rank: 1, value: 'cname.vercel-dns-0.com' }]
    })),
    removeDomain: vi.fn(async () => undefined)
  };
  const service = new DomainService(vercel as any);
  return { service, prisma, tx, vercel, updatedRows, auditRows };
}

describe('DomainService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets a new domain, stores PENDING_DNS, and writes audit', async () => {
    const ctx = buildContext();

    const result = await ctx.service.setCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      domain: 'track.example.com',
      actorUserId: 'user-a',
      actorIp: '127.0.0.1'
    });

    expect(ctx.vercel.addDomain).toHaveBeenCalledWith('track.example.com');
    expect(ctx.tx.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        customDomain: 'track.example.com',
        customDomainStatus: 'PENDING_DNS',
        domainVerified: false
      })
    }));
    expect(ctx.auditRows[0]).toEqual(expect.objectContaining({
      tenantId: 'tenant-a',
      actorId: 'user-a',
      action: 'tenant.custom_domain.set',
      resourceId: 'track.example.com'
    }));
    expect(result.instructions.value).toBe('cname.vercel-dns-0.com');
    expect(result.records).toEqual([
      expect.objectContaining({ type: 'CNAME', name: 'track', value: 'cname.vercel-dns-0.com' })
    ]);
  });

  it('returns Vercel TXT verification records when ownership proof is required', async () => {
    const ctx = buildContext();
    ctx.vercel.addDomain.mockResolvedValueOnce({
      name: 'track.example.com',
      verified: false,
      projectId: 'prj_123',
      verification: [
        {
          type: 'TXT',
          domain: '_vercel.example.com',
          value: 'vc-domain-verify=track.example.com,abc123',
          reason: 'pending_domain_verification'
        }
      ]
    });

    const result = await ctx.service.setCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      domain: 'track.example.com',
      actorUserId: 'user-a',
      actorIp: '127.0.0.1'
    });

    expect(result.records).toEqual([
      expect.objectContaining({ type: 'CNAME', name: 'track', host: 'track.example.com' }),
      expect.objectContaining({
        type: 'TXT',
        name: '_vercel',
        host: '_vercel.example.com',
        value: 'vc-domain-verify=track.example.com,abc123'
      })
    ]);
  });

  it('treats setting the same non-failed domain as an idempotent no-op', async () => {
    const ctx = buildContext(tenant({ customDomain: 'track.example.com', customDomainStatus: 'PENDING_DNS' }));

    await ctx.service.setCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      domain: 'track.example.com'
    });

    expect(ctx.vercel.addDomain).not.toHaveBeenCalled();
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('removes an old domain before adding a replacement', async () => {
    const ctx = buildContext(tenant({ customDomain: 'old.example.com', customDomainStatus: 'ACTIVE' }));

    await ctx.service.setCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      domain: 'new.example.com'
    });

    expect(ctx.vercel.removeDomain).toHaveBeenCalledWith('old.example.com');
    expect(ctx.vercel.removeDomain.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.vercel.addDomain.mock.invocationCallOrder[0]
    );
  });

  it('rejects reserved domains before external or database writes', async () => {
    const ctx = buildContext();

    await expect(ctx.service.setCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      domain: 'evil.fauward.com'
    })).rejects.toBeInstanceOf(DomainBusinessError);

    expect(ctx.vercel.addDomain).not.toHaveBeenCalled();
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps Vercel conflicts to DomainConflictError', async () => {
    const ctx = buildContext();
    ctx.vercel.addDomain.mockRejectedValueOnce(new VercelDomainAlreadyTakenError('taken'));
    ctx.vercel.getDomain.mockRejectedValueOnce(new Error('not found'));

    await expect(ctx.service.setCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      domain: 'track.example.com'
    })).rejects.toBeInstanceOf(DomainConflictError);

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('syncs an existing Vercel project domain when add reports it already exists', async () => {
    const ctx = buildContext();
    ctx.vercel.addDomain.mockRejectedValueOnce(new VercelDomainAlreadyTakenError('already exists'));
    ctx.vercel.getDomain.mockResolvedValueOnce({ name: 'track.example.com', verified: true, projectId: 'prj_123' });

    const result = await ctx.service.setCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      domain: 'track.example.com',
      actorUserId: 'user-a'
    });

    expect(ctx.vercel.getDomain).toHaveBeenCalledWith('track.example.com');
    expect(ctx.tx.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        customDomain: 'track.example.com',
        customDomainStatus: 'PENDING_DNS'
      })
    }));
    expect(result.records).toEqual([
      expect.objectContaining({ type: 'CNAME', name: 'track', value: 'cname.vercel-dns-0.com' })
    ]);
  });

  it('does not remove a reused existing Vercel project domain if the DB write conflicts', async () => {
    const ctx = buildContext();
    ctx.vercel.addDomain.mockRejectedValueOnce(new VercelDomainAlreadyTakenError('already exists'));
    ctx.vercel.getDomain.mockResolvedValueOnce({ name: 'track.example.com', verified: true, projectId: 'prj_123' });
    ctx.prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });

    await expect(ctx.service.setCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      domain: 'track.example.com'
    })).rejects.toBeInstanceOf(DomainConflictError);

    expect(ctx.vercel.removeDomain).not.toHaveBeenCalled();
  });

  it('maps Prisma P2002 conflicts and cleans up the just-added Vercel domain', async () => {
    const ctx = buildContext();
    ctx.prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });

    await expect(ctx.service.setCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      domain: 'track.example.com'
    })).rejects.toBeInstanceOf(DomainConflictError);

    expect(ctx.vercel.removeDomain).toHaveBeenCalledWith('track.example.com');
  });

  it('returns NONE without calling Vercel when no domain is configured', async () => {
    const ctx = buildContext();

    await expect(ctx.service.checkStatus(ctx.prisma as any, 'tenant-a')).resolves.toEqual({
      status: 'NONE',
      domain: null,
      instructions: null,
      records: [],
      error: null,
      verifiedAt: null,
      lastCheckAt: null
    });
    expect(ctx.vercel.verifyDomain).not.toHaveBeenCalled();
  });

  it('transitions PENDING_DNS to ACTIVE and audits the status change', async () => {
    const ctx = buildContext(tenant({ customDomain: 'track.example.com', customDomainStatus: 'PENDING_DNS' }));
    ctx.vercel.verifyDomain.mockResolvedValueOnce({ name: 'track.example.com', verified: true });

    const result = await ctx.service.checkStatus(ctx.prisma as any, 'tenant-a');

    expect(result.status).toBe('ACTIVE');
    expect(ctx.tx.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        customDomainStatus: 'ACTIVE',
        domainVerified: true
      })
    }));
    expect(ctx.auditRows[0]).toEqual(expect.objectContaining({
      action: 'tenant.custom_domain.status_changed',
      metadata: expect.objectContaining({ from: 'PENDING_DNS', to: 'ACTIVE' })
    }));
  });

  it('keeps status as PENDING_DNS when Vercel still requires a TXT record', async () => {
    const ctx = buildContext(tenant({ customDomain: 'track.example.com', customDomainStatus: 'VERIFYING' }));
    ctx.vercel.verifyDomain.mockResolvedValueOnce({
      name: 'track.example.com',
      verified: false,
      verification: [
        {
          type: 'TXT',
          domain: '_vercel.example.com',
          value: 'vc-domain-verify=track.example.com,abc123',
          reason: 'pending_domain_verification'
        }
      ]
    });

    const result = await ctx.service.checkStatus(ctx.prisma as any, 'tenant-a');

    expect(result.status).toBe('PENDING_DNS');
    expect(result.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'TXT', name: '_vercel', value: 'vc-domain-verify=track.example.com,abc123' })
    ]));
  });

  it('does not audit when status is unchanged', async () => {
    const ctx = buildContext(tenant({ customDomain: 'track.example.com', customDomainStatus: 'ACTIVE' }));
    ctx.vercel.verifyDomain.mockResolvedValueOnce({ name: 'track.example.com', verified: true });

    await ctx.service.checkStatus(ctx.prisma as any, 'tenant-a');

    expect(ctx.auditRows).toHaveLength(0);
  });

  it('does not call Vercel or audit when removing an absent domain', async () => {
    const ctx = buildContext();

    await ctx.service.removeCustomDomain(ctx.prisma as any, { tenantId: 'tenant-a' });

    expect(ctx.vercel.removeDomain).not.toHaveBeenCalled();
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('swallows Vercel remove errors but still clears the tenant row and audits', async () => {
    const ctx = buildContext(tenant({ customDomain: 'track.example.com', customDomainStatus: 'ACTIVE' }));
    ctx.vercel.removeDomain.mockRejectedValueOnce(new Error('network'));

    await ctx.service.removeCustomDomain(ctx.prisma as any, {
      tenantId: 'tenant-a',
      actorUserId: 'user-a'
    });

    expect(ctx.tx.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        customDomain: null,
        customDomainStatus: 'NONE'
      })
    }));
    expect(ctx.auditRows[0]).toEqual(expect.objectContaining({ action: 'tenant.custom_domain.removed' }));
  });
});
