import { describe, expect, it, vi } from 'vitest';
import { backfillSuspensionRecords } from './suspension-records.js';

function world() {
  const records: Array<Record<string, unknown>> = [{ id: 'susp_existing', tenantId: 't_has', status: 'ACTIVE' }];
  const appeals = [
    { id: 'appeal_1', tenantId: 't_bare', suspensionId: null, status: 'PENDING' },
    { id: 'appeal_2', tenantId: 't_has', suspensionId: null, status: 'OPEN' }
  ];
  const prisma = {
    tenant: {
      findMany: vi.fn(async () => [
        { id: 't_bare', suspensionReason: 'Chargebacks (internal note)', suspendedAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date() },
        { id: 't_has', suspensionReason: null, suspendedAt: null, updatedAt: new Date('2026-09-05T00:00:00Z') }
      ])
    },
    suspensionRecord: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string } }) => records.find((row) => row.tenantId === where.tenantId && row.status === 'ACTIVE') ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `susp_${records.length + 1}`, ...data };
        records.push(row);
        return row;
      })
    },
    tenantAppeal: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) => appeals.filter((row) => row.tenantId === where.tenantId && row.suspensionId === null)),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: { suspensionId: string } }) => {
        appeals.filter((row) => where.id.in.includes(row.id)).forEach((row) => Object.assign(row, data));
        return { count: where.id.in.length };
      })
    }
  };
  return { prisma, records, appeals };
}

describe('0042 suspension-records backfill (D3)', () => {
  it('dry-run counts without writing', async () => {
    const { prisma, records } = world();
    expect(await backfillSuspensionRecords(prisma as never, { dryRun: true })).toEqual({ dryRun: true, suspendedTenants: 2, recordsCreated: 1, appealsLinked: 2 });
    expect(records).toHaveLength(1);
  });

  it('creates one SYSTEM record per bare suspended tenant (internal reason kept internal), links open appeals, and is idempotent', async () => {
    const { prisma, records, appeals } = world();
    await backfillSuspensionRecords(prisma as never, { dryRun: false });
    expect(records[1]).toMatchObject({ tenantId: 't_bare', source: 'SYSTEM', category: 'OTHER', reason: 'Chargebacks (internal note)', createdAt: new Date('2026-09-01T00:00:00Z') });
    expect(records[1].publicReason).not.toContain('Chargebacks');
    expect(appeals.map((row) => row.suspensionId)).toEqual(['susp_2', 'susp_existing']);
    expect(await backfillSuspensionRecords(prisma as never, { dryRun: false })).toMatchObject({ recordsCreated: 0, appealsLinked: 0 });
  });
});
