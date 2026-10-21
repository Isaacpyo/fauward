import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';

// platform.database (WP-4.4): read-only views of the database. Prisma cannot express catalog queries, so these are raw
// SQL — every statement is a constant tagged template (no interpolated input) and runs inside a transaction opened with
// SET TRANSACTION READ ONLY, so even a mistaken statement cannot write (ACC-DB-3).

type Db = Pick<FastifyInstance['prisma'], '$transaction'>;

/** Runs `work` in a READ ONLY transaction; Postgres rejects any write inside it. */
export async function readOnly<T>(prisma: Db, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return work(tx);
  });
}

const toNumber = (value: bigint | number | null | undefined) => (value === null || value === undefined ? null : Number(value));
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

// ── Migrations ───────────────────────────────────────────────────────────────

type MigrationRow = { migration_name: string; started_at: Date; finished_at: Date | null; rolled_back_at: Date | null; applied_steps_count: number; logs: string | null };

export type MigrationStatus = 'APPLIED' | 'FAILED' | 'ROLLED_BACK' | 'PENDING' | 'NOT_IN_REPO';

/** Migration folders shipped with the backend (`prisma/migrations` next to the running process). */
export async function repoMigrations(dir = path.resolve(process.cwd(), 'prisma', 'migrations')) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return null;
  }
}

export async function listMigrations(app: Pick<FastifyInstance, 'prisma'>, dir?: string) {
  const repo = await repoMigrations(dir);
  const { tracked, rows } = await readOnly(app.prisma, async (tx) => {
    const [exists] = await tx.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
    if (!exists?.present) return { tracked: false, rows: [] as MigrationRow[] };
    const found = await tx.$queryRaw<MigrationRow[]>`
      SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs
      FROM public._prisma_migrations
      ORDER BY migration_name, started_at`;
    return { tracked: true, rows: found };
  });

  // The latest attempt per migration decides its status.
  const latest = new Map<string, MigrationRow>();
  for (const row of rows) latest.set(row.migration_name, row);
  const names = [...new Set([...(repo ?? []), ...latest.keys()])].sort();
  const data = names.map((name) => {
    const row = latest.get(name);
    const inRepo = repo ? repo.includes(name) : null;
    let status: MigrationStatus;
    if (!row) status = 'PENDING';
    else if (row.rolled_back_at) status = 'ROLLED_BACK';
    else if (!row.finished_at) status = 'FAILED';
    else status = inRepo === false ? 'NOT_IN_REPO' : 'APPLIED';
    return {
      name,
      status,
      inRepo,
      startedAt: iso(row?.started_at),
      finishedAt: iso(row?.finished_at),
      rolledBackAt: iso(row?.rolled_back_at),
      appliedSteps: row?.applied_steps_count ?? null,
      // Prisma writes the failure output here; it never contains row data.
      logs: status === 'FAILED' ? row?.logs?.slice(0, 4000) ?? null : null
    };
  });
  const count = (status: MigrationStatus) => data.filter((row) => row.status === status).length;
  return {
    tracked,
    repoAvailable: repo !== null,
    summary: { applied: count('APPLIED'), failed: count('FAILED'), pending: tracked ? count('PENDING') : null, rolledBack: count('ROLLED_BACK'), notInRepo: count('NOT_IN_REPO') },
    degraded: !tracked
      ? 'This database has no _prisma_migrations table: its schema was created with `prisma db push`, so no migration history exists.'
      : repo === null
        ? 'The prisma/migrations folder is not shipped next to the backend, so pending migrations cannot be listed.'
        : null,
    data: tracked ? data : data.map((row) => ({ ...row, status: null }))
  };
}

// ── Tables ───────────────────────────────────────────────────────────────────

type TableRow = {
  table_name: string;
  row_estimate: bigint | number | null;
  total_bytes: bigint | number;
  table_bytes: bigint | number;
  index_bytes: bigint | number;
  last_vacuum: Date | null;
  last_autovacuum: Date | null;
  last_analyze: Date | null;
  last_autoanalyze: Date | null;
  dead_tuples: bigint | number | null;
};

export async function listTables(app: Pick<FastifyInstance, 'prisma'>) {
  const rows = await readOnly(app.prisma, (tx) =>
    tx.$queryRaw<TableRow[]>`
      SELECT s.relname AS table_name,
             s.n_live_tup AS row_estimate,
             pg_total_relation_size(s.relid) AS total_bytes,
             pg_relation_size(s.relid) AS table_bytes,
             pg_indexes_size(s.relid) AS index_bytes,
             s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze,
             s.n_dead_tup AS dead_tuples
      FROM pg_stat_user_tables s
      WHERE s.schemaname = 'public'
      ORDER BY pg_total_relation_size(s.relid) DESC`
  );
  const data = rows.map((row) => ({
    name: row.table_name,
    rowEstimate: toNumber(row.row_estimate),
    totalBytes: toNumber(row.total_bytes) ?? 0,
    tableBytes: toNumber(row.table_bytes) ?? 0,
    indexBytes: toNumber(row.index_bytes) ?? 0,
    deadTuples: toNumber(row.dead_tuples),
    lastVacuumAt: iso([row.last_vacuum, row.last_autovacuum].filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0]),
    lastAnalyzeAt: iso([row.last_analyze, row.last_autoanalyze].filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0])
  }));
  return { data, totalBytes: data.reduce((sum, row) => sum + row.totalBytes, 0) };
}

// ── Slow queries ─────────────────────────────────────────────────────────────

type StatementRow = { query: string; calls: bigint | number; mean_ms: number; total_ms: number; rows: bigint | number };

export async function slowQueries(app: Pick<FastifyInstance, 'prisma'>) {
  return readOnly(app.prisma, async (tx) => {
    const [extension] = await tx.$queryRaw<Array<{ installed: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS installed`;
    if (!extension?.installed) {
      return { available: false as const, extension: 'pg_stat_statements', reason: 'The pg_stat_statements extension is not enabled on this database, so query timings are not recorded.', data: [] };
    }
    try {
      // Statement text is normalised by pg_stat_statements (constants become $1, $2 …).
      const rows = await tx.$queryRaw<StatementRow[]>`
        SELECT query, calls, mean_exec_time AS mean_ms, total_exec_time AS total_ms, rows
        FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        ORDER BY mean_exec_time DESC
        LIMIT 20`;
      return {
        available: true as const,
        extension: 'pg_stat_statements',
        reason: null,
        data: rows.map((row) => ({ query: row.query.slice(0, 2000), calls: toNumber(row.calls) ?? 0, meanMs: Number(row.mean_ms), totalMs: Number(row.total_ms), rows: toNumber(row.rows) ?? 0 }))
      };
    } catch (error) {
      // Installed but not preloaded (shared_preload_libraries) — the view errors on read.
      return { available: false as const, extension: 'pg_stat_statements', reason: `pg_stat_statements is installed but cannot be read: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}`, data: [] };
    }
  });
}

// ── Connections ──────────────────────────────────────────────────────────────

export async function connections(app: Pick<FastifyInstance, 'prisma'>) {
  return readOnly(app.prisma, async (tx) => {
    const byState = await tx.$queryRaw<Array<{ state: string | null; count: bigint | number }>>`
      SELECT state, count(*) AS count FROM pg_stat_activity WHERE datname = current_database() GROUP BY state ORDER BY count(*) DESC`;
    const [limit] = await tx.$queryRaw<Array<{ max_connections: string }>>`SELECT current_setting('max_connections') AS max_connections`;
    const data = byState.map((row) => ({ state: row.state ?? 'background', count: toNumber(row.count) ?? 0 }));
    return { data, total: data.reduce((sum, row) => sum + row.count, 0), maxConnections: limit ? Number(limit.max_connections) : null };
  });
}
