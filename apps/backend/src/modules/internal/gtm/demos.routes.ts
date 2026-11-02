import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { dangerous } from '../../../middleware/dangerous.js';
import {
  DemoError,
  createDemo,
  createDemoBody,
  demoListQuery,
  endDemoBody,
  extendDemo,
  extendDemoBody,
  getDemo,
  listDemos,
  listTemplates,
  rotateShareLink,
  teardownDemo
} from '../../../services/demos.service.js';

// gtm.demos (WP-4.15): demo environments from code-defined templates. Create returns the admin password and share link
// once; extend and rotate are writes; teardown is dangerous and refuses non-DEMO tenants.

const read = [authenticatePlatformSession, requireConsolePermission('gtm.demos.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('gtm.demos.write')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof DemoError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleDemoRoutes(app: FastifyInstance) {
  app.get('/api/internal/demos', { preHandler: read }, async (request, reply) => {
    const parsed = demoListQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listDemos(app, parsed.data));
  });

  app.get('/api/internal/demos/templates', { preHandler: read }, async (_request, reply) => reply.send(listTemplates()));

  app.post('/api/internal/demos', { preHandler: write }, async (request, reply) => {
    const parsed = createDemoBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await createDemo(app, request, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/demos/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await getDemo(app, id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/demos/:id/extend', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = extendDemoBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await extendDemo(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/demos/:id/share-link', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await rotateShareLink(app, request, id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete('/api/internal/demos/:id', { preHandler: dangerous('gtm.demos.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = endDemoBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await teardownDemo(app, request, id, parsed.data.reason));
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
