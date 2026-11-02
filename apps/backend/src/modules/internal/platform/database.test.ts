import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma } from '../../../test-support/test-db.js';

// platform.database (WP-4.4): read-only views. Classification is checked against a fake catalogue; the real-Postgres
// suite proves every endpoint answers from the slot database inside a READ ONLY transaction.

const permissions = vi.hoisted(() => ({ current: [] as Permission[], userId: 'unset' }));

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = {
      user: { id: permissions.userId, email: 'db@fauward.test', name: 'DB Reader', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_db', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: permissions.userId }
    };
  }
}));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(permissions.current), jit: new Map(), permissions: permissions.current }))
}));

/** A $transaction stand-in that records every statement and answers $queryRaw from a queue. */
function fakeCatalogue(answers: unknown[][]) {
  const statements: string[] = [];
  const tx = {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      statements.push(strings.join('?').trim());
      return 0;
    }),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      statements.push(strings.join('?').trim());
      return answers.shift() ?? [];
    })
  };
  const prisma = { $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  return { prisma, statements };
}

describe('platform.database classification (WP-4.4)', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'fw-migrations-'));
    for (const name of ['0001_init', '0002_users', '0003_failed', '0004_pending']) await mkdir(path.join(dir, name));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('ACC-DB-1 every repo migration is listed with its status: applied, failed, pending, rolled back, not in repo', async () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const { prisma, statements } = fakeCatalogue([
      [{ present: true }],
      [
        { migration_name: '0001_init', started_at: at, finished_at: at, rolled_back_at: null, applied_steps_count: 1, logs: null },
        { migration_name: '0002_users', started_at: at, finished_at: null, rolled_back_at: at, applied_steps_count: 0, logs: 'boom' },
        { migration_name: '0002_users', started_at: at, finished_at: at, rolled_back_at: null, applied_steps_count: 1, logs: null },
        { migration_name: '0003_failed', started_at: at, finished_at: null, rolled_back_at: null, applied_steps_count: 0, logs: 'ERROR: relation "x" does not exist' },
        { migration_name: '0000_hotfix', started_at: at, finished_at: at, rolled_back_at: null, applied_steps_count: 1, logs: null }
      ]
    ]);
    const { listMigrations } = await import('../../../services/database-ops.service.js');
    const result = await listMigrations({ prisma: prisma as never }, dir);
    expect(result.tracked).toBe(true);
    expect(result.degraded).toBeNull();
    expect(Object.fromEntries(result.data.map((row) => [row.name, row.status]))).toEqual({
      '0000_hotfix': 'NOT_IN_REPO',
      '0001_init': 'APPLIED',
      '0002_users': 'APPLIED',
      '0003_failed': 'FAILED',
      '0004_pending': 'PENDING'
    });
    expect(result.data.find((row) => row.name === '0003_failed')?.logs).toContain('does not exist');
    expect(result.summary).toEqual({ applied: 2, failed: 1, pending: 1, rolledBack: 0, notInRepo: 1 });
    expect(statements[0]).toBe('SET TRANSACTION READ ONLY');
  });

  it('ACC-DB-2 slow queries name the missing extension instead of failing', async () => {
    const { prisma } = fakeCatalogue([[{ installed: false }]]);
    const { slowQueries } = await import('../../../services/database-ops.service.js');
    expect(await slowQueries({ prisma: prisma as never })).toMatchObject({ available: false, extension: 'pg_stat_statements', reason: expect.stringContaining('pg_stat_statements'), data: [] });
  });

  it('ACC-DB-3 every endpoint opens its transaction with SET TRANSACTION READ ONLY before any query', async () => {
    const service = await import('../../../services/database-ops.service.js');
    const calls: Array<[string, (app: never) => Promise<unknown>]> = [
      ['migrations', (app) => service.listMigrations(app, '/nonexistent')],
      ['tables', (app) => service.listTables(app)],
      ['slow-queries', (app) => service.slowQueries(app)],
      ['connections', (app) => service.connections(app)]
    ];
    for (const [name, call] of calls) {
      const { prisma, statements } = fakeCatalogue([[{ present: false, installed: false, max_connections: '100' }], []]);
      await call({ prisma } as never);
      expect(statements[0], name).toBe('SET TRANSACTION READ ONLY');
      expect(statements.slice(1).every((statement) => /^SELECT/i.test(statement)), name).toBe(true);
    }
  });
});

describe.runIf(HAS_TEST_DB)('platform.database (WP-4.4, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const staff = await createTestPlatformUser(prisma);
    permissions.userId = staff.id;
    permissions.current = ['platform.database.read'];
    app = Fastify();
    app.decorate('prisma', prisma);
    const { registerConsoleDatabaseRoutes } = await import('./database.routes.js');
    await registerConsoleDatabaseRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-DB-3 a write inside the read-only helper is rejected by Postgres', async () => {
    const { readOnly } = await import('../../../services/database-ops.service.js');
    await expect(readOnly(prisma, (tx) => tx.$executeRaw`CREATE TEMP TABLE fw_should_not_exist (id int)`)).rejects.toThrow(/read-only transaction/);
  });

  it('ACC-DB-1 migrations list every repo folder; a db-push database says it has no history', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/internal/database/migrations' })).json();
    expect(body.repoAvailable).toBe(true);
    expect(body.data.map((row: { name: string }) => row.name)).toEqual(expect.arrayContaining(['0063_incidents_native', '0064_secret_inventory']));
    if (!body.tracked) expect(body.degraded).toContain('prisma db push');
  });

  it('tables, connections and slow queries answer from the catalogue', async () => {
    const tables = (await app.inject({ method: 'GET', url: '/api/internal/database/tables' })).json();
    expect(tables.data.find((row: { name: string }) => row.name === 'tenants')).toMatchObject({ totalBytes: expect.any(Number), rowEstimate: expect.any(Number) });
    const conns = (await app.inject({ method: 'GET', url: '/api/internal/database/connections' })).json();
    expect(conns.total).toBeGreaterThanOrEqual(1);
    expect(conns.maxConnections).toBeGreaterThan(0);
    const [extension] = await prisma.$queryRaw<Array<{ installed: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS installed`;
    const slow = (await app.inject({ method: 'GET', url: '/api/internal/database/slow-queries' })).json();
    expect(slow.extension).toBe('pg_stat_statements');
    if (!extension.installed) expect(slow).toMatchObject({ available: false, data: [] });
    permissions.current = [];
    expect((await app.inject({ method: 'GET', url: '/api/internal/database/tables' })).statusCode).toBe(403);
    permissions.current = ['platform.database.read'];
  });
});
