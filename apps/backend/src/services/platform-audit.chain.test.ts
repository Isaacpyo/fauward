import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writePlatformAuditLog } from './platform-audit.service.js';
import { HAS_TEST_DB, createTestPrisma } from '../test-support/test-db.js';

// Real Postgres (CI sets TEST_DATABASE_URL). Concurrent appends used to read the same latest row and fork the chain,
// which audit:chain:verify then reported as tampering. The check is on linkage (previousHash = the hash of the row
// before it, in createdAt order), so it holds while other suites append at the same time. writeAudit takes the same
// lock (audit-chain-lock.test.ts); its rows are not written here because they hash differently.
describe.runIf(HAS_TEST_DB)('platform audit chain under concurrent writers', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    // Tunnel-tolerant transaction waits: half the writers hold a caller transaction while they queue on the lock.
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('serialises concurrent appends, from the client and from callers inside a transaction', async () => {
    const run = randomUUID();
    const writes = Array.from({ length: 30 }, (_, index) =>
      index % 2 === 0
        ? writePlatformAuditLog(prisma, { actorType: 'SYSTEM', actorId: run, action: 'CHAIN_TEST', metadata: { index } })
        : prisma.$transaction((tx) =>
            writePlatformAuditLog(tx, { actorType: 'SYSTEM', actorId: run, action: 'CHAIN_TEST', metadata: { index } })
          )
    );
    await Promise.all(writes);

    const rows = await prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, actorId: true, hash: true, previousHash: true, createdAt: true }
    });
    const mine = rows.filter((row) => row.actorId === run);
    expect(mine).toHaveLength(30);

    for (let index = 1; index < rows.length; index += 1) {
      if (rows[index].actorId !== run) continue;
      expect(rows[index].createdAt.getTime()).toBeGreaterThan(rows[index - 1].createdAt.getTime());
      expect(rows[index].previousHash).toBe(rows[index - 1].hash);
    }
    const forks = await prisma.platformAuditLog.groupBy({ by: ['previousHash'], where: { actorId: run }, _count: { _all: true } });
    expect(forks.every((group) => group._count._all === 1)).toBe(true);
  });
});
