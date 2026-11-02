import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { staffMutationActor } from '../../../services/console-mutation.js';
import {
  PipelineError,
  createDeal,
  createDealBody,
  forecast,
  forecastQuery,
  getDeal,
  importHubspotDeals,
  listDeals,
  listDealsQuery,
  tenantDeals,
  updateDeal,
  updateDealBody
} from '../../../services/pipeline.service.js';
import { vendorStatus } from '../../../services/vendors/index.js';

// gtm.pipeline (WP-4.18): deals (list by stage with owner/close-month filters, create, edit), the weighted forecast,
// the HubSpot import (only when configured; the nightly gtm.hubspot-import job does the same) and the tenant's deals
// for the C360 Overview.

const read = [authenticatePlatformSession, requireConsolePermission('gtm.pipeline.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('gtm.pipeline.write')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof PipelineError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsolePipelineRoutes(app: FastifyInstance) {
  app.get('/api/internal/pipeline', { preHandler: read }, async (request, reply) => {
    const parsed = listDealsQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listDeals(app, parsed.data));
  });

  app.post('/api/internal/pipeline', { preHandler: write }, async (request, reply) => {
    const parsed = createDealBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await createDeal(app, staffMutationActor(request), request.platform!.user.id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/pipeline/forecasting', { preHandler: read }, async (request, reply) => {
    const parsed = forecastQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await forecast(app, parsed.data));
  });

  app.post('/api/internal/pipeline/import/hubspot', { preHandler: write }, async (request, reply) => {
    const vendor = vendorStatus('hubspot');
    if (vendor) return reply.status(409).send({ error: 'HUBSPOT_NOT_CONFIGURED', message: `HubSpot is not configured (missing ${vendor.missing.join(', ')}).`, vendor });
    return reply.send(await importHubspotDeals(app, staffMutationActor(request)));
  });

  app.get('/api/internal/pipeline/:dealId', { preHandler: read }, async (request, reply) => {
    const { dealId } = request.params as { dealId: string };
    try {
      return reply.send(await getDeal(app, dealId));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch('/api/internal/pipeline/:dealId', { preHandler: write }, async (request, reply) => {
    const { dealId } = request.params as { dealId: string };
    const parsed = updateDealBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await updateDeal(app, staffMutationActor(request), dealId, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/customer360/:tenantId/deals', { preHandler: read }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    return reply.send(await tenantDeals(app, tenantId));
  });
}
