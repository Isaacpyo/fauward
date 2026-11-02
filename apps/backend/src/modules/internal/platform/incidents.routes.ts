import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import {
  IncidentError,
  addIncidentImpact,
  createIncident,
  createRunbook,
  deleteRunbook,
  getIncident,
  getRunbook,
  incidentCreateBody,
  incidentImpactBody,
  incidentListQuery,
  incidentPatchBody,
  incidentResolveBody,
  incidentUpdateBody,
  listIncidents,
  listResponders,
  listRunbooks,
  parsePagerDutyIncident,
  patchIncident,
  patchRunbook,
  postIncidentUpdate,
  resolveIncident,
  runbookCreateBody,
  runbookPatchBody,
  upsertPagerDutyIncident
} from '../../../services/incident.service.js';
import { pagerDutyAdapter } from '../../../services/vendors/pagerduty.adapter.js';
import { vendorStatus } from '../../../services/vendors/index.js';
import { recordWebhookVerification, verifyWebhookHmac, webhookPayload } from '../webhook-hmac.js';

// platform.incidents (WP-4.2): native incidents (declare, update, tag tenants, public updates → INCIDENT announcement,
// resolve + postmortem), runbook CRUD, and the optional PagerDuty producer (HMAC-verified webhook, upsert by vendorId).
// Tenant escalations (WP-2.11) live in escalations.routes.ts under the same service.

const read = [authenticatePlatformSession, requireConsolePermission('platform.incidents.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('platform.incidents.write')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendIncidentError(reply: FastifyReply, error: unknown) {
  if (error instanceof IncidentError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleIncidentRoutes(app: FastifyInstance) {
  // ── Incidents ──────────────────────────────────────────────────────────────
  app.get('/api/internal/incidents', { preHandler: read }, async (request, reply) => {
    const parsed = incidentListQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send({ ...(await listIncidents(app, parsed.data)), pagerDuty: vendorStatus('pagerduty') });
  });

  app.post('/api/internal/incidents', { preHandler: write }, async (request, reply) => {
    const parsed = incidentCreateBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      const incident = await createIncident(app, request, parsed.data);
      return reply.status(201).send(await getIncident(app, incident.id));
    } catch (error) {
      return sendIncidentError(reply, error);
    }
  });

  app.get('/api/internal/incidents/responders', { preHandler: read }, async (_request, reply) => {
    return reply.send({ data: await listResponders(app) });
  });

  // ── Runbooks (static paths before /incidents/:id) ──────────────────────────
  app.get('/api/internal/incidents/runbooks', { preHandler: read }, async (_request, reply) => {
    return reply.send(await listRunbooks(app));
  });

  app.post('/api/internal/incidents/runbooks', { preHandler: write }, async (request, reply) => {
    const parsed = runbookCreateBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await createRunbook(app, request, parsed.data));
    } catch (error) {
      return sendIncidentError(reply, error);
    }
  });

  app.get('/api/internal/incidents/runbooks/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const runbook = await getRunbook(app, id);
    if (!runbook) return reply.status(404).send({ error: 'RUNBOOK_NOT_FOUND', message: 'Runbook not found' });
    return reply.send(runbook);
  });

  app.patch('/api/internal/incidents/runbooks/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = runbookPatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await patchRunbook(app, request, id, parsed.data));
    } catch (error) {
      return sendIncidentError(reply, error);
    }
  });

  app.delete('/api/internal/incidents/runbooks/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await deleteRunbook(app, request, id));
    } catch (error) {
      return sendIncidentError(reply, error);
    }
  });

  // ── One incident ───────────────────────────────────────────────────────────
  app.get('/api/internal/incidents/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const incident = await getIncident(app, id);
    if (!incident) return reply.status(404).send({ error: 'INCIDENT_NOT_FOUND', message: 'Incident not found' });
    return reply.send(incident);
  });

  app.patch('/api/internal/incidents/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = incidentPatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      await patchIncident(app, request, id, parsed.data);
      return reply.send(await getIncident(app, id));
    } catch (error) {
      return sendIncidentError(reply, error);
    }
  });

  app.post('/api/internal/incidents/:id/updates', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = incidentUpdateBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await postIncidentUpdate(app, request, id, parsed.data));
    } catch (error) {
      return sendIncidentError(reply, error);
    }
  });

  app.post('/api/internal/incidents/:id/impacts', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = incidentImpactBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, parsed.error.issues[0]?.path[0] === 'tenantId' ? 'TENANT_REQUIRED' : 'INVALID_BODY');
    try {
      return reply.status(201).send(await addIncidentImpact(app, request, id, parsed.data));
    } catch (error) {
      return sendIncidentError(reply, error);
    }
  });

  app.post('/api/internal/incidents/:id/resolve', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = incidentResolveBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      const result = await resolveIncident(app, request, id, parsed.data);
      return reply.send({ incident: await getIncident(app, result.incident.id), announcement: result.announcement });
    } catch (error) {
      return sendIncidentError(reply, error);
    }
  });

  // ── PagerDuty (optional producer; HMAC-verified, no console session) ───────
  app.post('/api/internal/incidents/webhooks/pagerduty', async (request, reply) => {
    const verification = verifyWebhookHmac(request, reply, {
      envName: 'PAGERDUTY_WEBHOOK_SECRET',
      signatureHeaderNames: ['x-pagerduty-signature'],
      timestampHeaderNames: ['x-pagerduty-request-timestamp', 'x-pagerduty-webhook-timestamp'],
      scheme: 'pagerduty'
    });
    if (!verification) return;
    await recordWebhookVerification(app, pagerDutyAdapter.vendor, verification);
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? (request.body as Record<string, unknown>) : {};
    const parsed = parsePagerDutyIncident(body);
    if (!parsed.vendorId) return reply.status(202).send({ received: true, ignored: 'NO_INCIDENT_ID' });
    const { incident, created } = await upsertPagerDutyIncident(app, { ...parsed, vendorId: parsed.vendorId }, webhookPayload(body, verification) as Prisma.InputJsonObject);
    return reply.send({ received: true, created, incident: { id: incident.id, vendorId: incident.vendorId, status: incident.status, severity: incident.severity } });
  });
}
