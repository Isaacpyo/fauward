import { randomUUID } from 'node:crypto';
import { PrismaClient, TenantPlan, TenantStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const describeDb = process.env.CUSTOM_DOMAIN_DB_INTEGRATION === '1' ? describe : describe.skip;

describeDb('custom domain database integration', () => {
  const prisma = new PrismaClient();
  const tenantIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.$disconnect();
  });

  it('has custom-domain columns, status index, and unique domain constraint', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tenants'
        AND column_name IN (
          'customDomainStatus',
          'customDomainVerificationToken',
          'customDomainAddedAt',
          'customDomainVerifiedAt',
          'customDomainLastCheckAt',
          'customDomainError',
          'customDomainVercelId'
        )
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'tenants'
        AND (indexname = 'tenants_customDomain_key' OR indexname = 'tenants_customDomainStatus_idx')
    `;

    expect(columns.map((column) => column.column_name).sort()).toEqual([
      'customDomainAddedAt',
      'customDomainError',
      'customDomainLastCheckAt',
      'customDomainStatus',
      'customDomainVercelId',
      'customDomainVerificationToken',
      'customDomainVerifiedAt'
    ]);
    expect(indexes.some((index) => index.indexname === 'tenants_customDomain_key' && index.indexdef.includes('UNIQUE'))).toBe(true);
    expect(indexes.some((index) => index.indexname === 'tenants_customDomainStatus_idx')).toBe(true);
  });

  it('enforces uniqueness for concurrent domain claims', async () => {
    const suffix = randomUUID().slice(0, 8);
    const [tenantA, tenantB] = await Promise.all([
      prisma.tenant.create({
        data: {
          name: `Domain Test A ${suffix}`,
          slug: `domain-test-a-${suffix}`,
          plan: TenantPlan.PRO,
          status: TenantStatus.ACTIVE
        }
      }),
      prisma.tenant.create({
        data: {
          name: `Domain Test B ${suffix}`,
          slug: `domain-test-b-${suffix}`,
          plan: TenantPlan.PRO,
          status: TenantStatus.ACTIVE
        }
      })
    ]);
    tenantIds.push(tenantA.id, tenantB.id);

    const domain = `race-${suffix}.example.com`;
    const results = await Promise.allSettled([
      prisma.tenant.update({ where: { id: tenantA.id }, data: { customDomain: domain } }),
      prisma.tenant.update({ where: { id: tenantB.id }, data: { customDomain: domain } })
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
