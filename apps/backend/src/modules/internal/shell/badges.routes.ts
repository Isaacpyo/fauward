import type { FastifyInstance } from 'fastify';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { loadConsoleContext } from '../../../middleware/require-console-permission.js';
import { computeBadges } from '../../../services/console-badges.service.js';
import { defaultQueueRegistry, type QueueRegistry } from '../../../services/queue-registry.js';
import { consoleCan } from './metrics.routes.js';

// GET /api/internal/badges (WP-3.4, architecture §6.4). Session-only: the response holds only the keys the caller's
// permissions can read, so the same endpoint serves every role.

export async function registerConsoleBadgeRoutes(app: FastifyInstance, options: { queues?: QueueRegistry } = {}) {
  const queues = options.queues ?? defaultQueueRegistry;
  app.get('/api/internal/badges', { preHandler: [authenticatePlatformSession] }, async (request, reply) => {
    const context = await loadConsoleContext(request);
    return reply.send(await computeBadges({ app, queues, now: new Date() }, consoleCan(context)));
  });
}
