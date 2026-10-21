import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { dangerous } from '../../../middleware/dangerous.js';
import {
  TaxError,
  certificateBytes,
  createRegistration,
  decideExemption,
  decisionBody,
  deleteRegistration,
  exemptionListQuery,
  listExemptions,
  listRegistrations,
  patchRegistration,
  registrationBody,
  registrationPatchBody,
  taxOverview
} from '../../../services/tax.service.js';

// revenue.tax (WP-4.7): overview, Fauward's tax registrations (CRUD), tenant exemption queue, certificate download and
// the dangerous approve / reject / revoke decision. Tax returns are not tracked here (TaxReturn is dropped, D10).

const read = [authenticatePlatformSession, requireConsolePermission('revenue.tax.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('revenue.tax.write')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof TaxError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleTaxRoutes(app: FastifyInstance) {
  app.get('/api/internal/tax/overview', { preHandler: read }, async (_request, reply) => reply.send(await taxOverview(app)));

  app.get('/api/internal/tax/registrations', { preHandler: read }, async (_request, reply) => reply.send(await listRegistrations(app)));

  app.post('/api/internal/tax/registrations', { preHandler: write }, async (request, reply) => {
    const parsed = registrationBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await createRegistration(app, request, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch('/api/internal/tax/registrations/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = registrationPatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await patchRegistration(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete('/api/internal/tax/registrations/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await deleteRegistration(app, request, id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/tax/exemptions', { preHandler: read }, async (request, reply) => {
    const parsed = exemptionListQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listExemptions(app, parsed.data));
  });

  app.get('/api/internal/tax/exemptions/:id/certificate', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = await certificateBytes(app, id);
    if (!file) return reply.status(404).send({ error: 'CERTIFICATE_NOT_FOUND', message: 'No certificate is stored for this exemption' });
    return reply
      .header('content-type', file.contentType)
      .header('content-disposition', `attachment; filename="${file.fileName.replace(/["\\\r\n]/g, '_')}"`)
      .header('cache-control', 'no-store')
      .send(file.bytes);
  });

  app.post('/api/internal/tax/exemptions/:id/decision', { preHandler: dangerous('revenue.tax.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = decisionBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await decideExemption(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
