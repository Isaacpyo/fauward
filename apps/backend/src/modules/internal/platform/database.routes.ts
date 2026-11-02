import type { FastifyInstance } from 'fastify';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { connections, listMigrations, listTables, slowQueries } from '../../../services/database-ops.service.js';

// platform.database (WP-4.4): read-only — migrations (applied/failed/pending vs the shipped folder), table sizes and
// row estimates, slow queries when pg_stat_statements is enabled, connection counts. No route writes.

const read = [authenticatePlatformSession, requireConsolePermission('platform.database.read')];

export async function registerConsoleDatabaseRoutes(app: FastifyInstance) {
  app.get('/api/internal/database/migrations', { preHandler: read }, async (_request, reply) => reply.send(await listMigrations(app)));
  app.get('/api/internal/database/tables', { preHandler: read }, async (_request, reply) => reply.send(await listTables(app)));
  app.get('/api/internal/database/slow-queries', { preHandler: read }, async (_request, reply) => reply.send(await slowQueries(app)));
  app.get('/api/internal/database/connections', { preHandler: read }, async (_request, reply) => reply.send(await connections(app)));
}
