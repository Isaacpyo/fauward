import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import {
  attributionCampaigns,
  attributionFunnel,
  attributionLandingPages,
  attributionQuery,
  attributionSummary
} from '../../../services/attribution.service.js';

// gtm.attribution (WP-4.16): signups by first touch (source/medium, campaign, landing page) and the funnel signup →
// activated → paid over a date range. Read-only; DEMO tenants excluded.

const read = [authenticatePlatformSession, requireConsolePermission('gtm.attribution.read')];

type Report = (app: FastifyInstance, query: ReturnType<typeof attributionQuery.parse>) => Promise<unknown>;

function handler(app: FastifyInstance, report: Report) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = attributionQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) return reply.status(400).send({ error: 'INVALID_QUERY', message: '`from` must not be after `to`.' });
    return reply.send(await report(app, parsed.data));
  };
}

export async function registerConsoleAttributionRoutes(app: FastifyInstance) {
  app.get('/api/internal/attribution/summary', { preHandler: read }, handler(app, attributionSummary));
  app.get('/api/internal/attribution/campaigns', { preHandler: read }, handler(app, attributionCampaigns));
  app.get('/api/internal/attribution/landing-pages', { preHandler: read }, handler(app, attributionLandingPages));
  app.get('/api/internal/attribution/funnel', { preHandler: read }, handler(app, attributionFunnel));
}
