import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { dangerous } from '../../../middleware/dangerous.js';
import {
  KycError,
  applyComplyAdvantageWebhook,
  applyPersonaWebhook,
  attachStaffEvidence,
  decideReview,
  decideScreening,
  evidenceBody,
  evidenceFile,
  getReview,
  listReviews,
  listScreenings,
  manualScreen,
  openReview,
  openReviewBody,
  reviewDecisionBody,
  reviewListQuery,
  screenBody,
  screeningDecisionBody,
  screeningListQuery
} from '../../../services/kyc.service.js';
import { recordWebhookVerification, verifyWebhookHmac, webhookPayload } from '../webhook-hmac.js';

// trust.kyc (WP-4.10): manual review queue (open, evidence, decision), sanctions/PEP screenings (manual or monthly,
// CLEAR/MATCH), and the optional Persona / ComplyAdvantage webhooks (HMAC-verified, no console session).

const read = [authenticatePlatformSession, requireConsolePermission('trust.kyc.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('trust.kyc.approve')];

function invalid(reply: FastifyReply, error: ZodError, code = 'INVALID_BODY') {
  return reply.status(400).send({ error: code, message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof KycError) return reply.status(error.statusCode).send({ error: error.code, message: error.message, ...error.extra });
  throw error;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function registerConsoleKycRoutes(app: FastifyInstance) {
  app.get('/api/internal/kyc/reviews', { preHandler: read }, async (request, reply) => {
    const parsed = reviewListQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listReviews(app, parsed.data));
  });

  app.post('/api/internal/kyc/reviews', { preHandler: write }, async (request, reply) => {
    const parsed = openReviewBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await openReview(app, request, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/kyc/reviews/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const review = await getReview(app, id);
    if (!review) return reply.status(404).send({ error: 'REVIEW_NOT_FOUND', message: 'KYC review not found' });
    return reply.send(review);
  });

  app.post('/api/internal/kyc/reviews/:id/evidence', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = evidenceBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await attachStaffEvidence(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/kyc/reviews/:id/evidence/:evidenceId', { preHandler: read }, async (request, reply) => {
    const { id, evidenceId } = request.params as { id: string; evidenceId: string };
    const file = await evidenceFile(app, id, evidenceId);
    if (!file) return reply.status(404).send({ error: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found' });
    return reply
      .header('content-type', file.contentType)
      .header('content-disposition', `attachment; filename="${file.fileName.replace(/["\\\r\n]/g, '_')}"`)
      .header('cache-control', 'no-store')
      .send(file.bytes);
  });

  app.post('/api/internal/kyc/reviews/:id/decision', { preHandler: dangerous('trust.kyc.approve') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = reviewDecisionBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await decideReview(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/kyc/screenings', { preHandler: read }, async (request, reply) => {
    const parsed = screeningListQuery.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error, 'INVALID_QUERY');
    return reply.send(await listScreenings(app, parsed.data));
  });

  app.post('/api/internal/kyc/screenings', { preHandler: write }, async (request, reply) => {
    const parsed = screenBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await manualScreen(app, request, parsed.data.tenantId));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/kyc/screenings/:id/decision', { preHandler: dangerous('trust.kyc.approve') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = screeningDecisionBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await decideScreening(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // ── Vendor webhooks (optional producers) ─────────────────────────────────
  app.post('/api/internal/kyc/webhooks/persona', async (request, reply) => {
    const verification = verifyWebhookHmac(request, reply, { envName: 'PERSONA_WEBHOOK_SECRET', signatureHeaderNames: ['persona-signature'], timestampHeaderNames: ['persona-timestamp'], scheme: 'persona' });
    if (!verification) return;
    await recordWebhookVerification(app, 'persona', verification);
    const body = record(request.body);
    const data = record(body.data);
    const attributes = record(data.attributes);
    const inquiryId = text(data.id) ?? text(body.inquiryId);
    const tenantId = text(body.tenantId) ?? text(attributes['reference-id']) ?? text(attributes.referenceId);
    if (!inquiryId && !tenantId) return reply.status(202).send({ received: true, ignored: true, reason: 'missing inquiry or tenant reference' });
    const result = await applyPersonaWebhook(app, { inquiryId, tenantId, status: text(attributes.status) ?? text(body.status) ?? 'updated', payload: webhookPayload(body, verification) as Prisma.InputJsonObject });
    return reply.send({ received: true, ...result });
  });

  app.post('/api/internal/kyc/webhooks/complyadvantage', async (request, reply) => {
    const verification = verifyWebhookHmac(request, reply, {
      envName: 'COMPLYADVANTAGE_WEBHOOK_SECRET',
      signatureHeaderNames: ['webhook-signature'],
      timestampHeaderNames: ['webhook-timestamp'],
      webhookIdHeaderNames: ['webhook-id'],
      scheme: 'complyadvantage'
    });
    if (!verification) return;
    await recordWebhookVerification(app, 'complyadvantage', verification);
    const body = record(request.body);
    const data = record(body.data);
    const tenantId = text(body.tenantId) ?? text(body.client_ref) ?? text(data.client_ref);
    if (!tenantId) return reply.status(202).send({ received: true, ignored: true, reason: 'missing tenant reference' });
    const screening = await applyComplyAdvantageWebhook(app, { tenantId, matchType: text(body.matchType) ?? text(data.matchType), riskLevel: text(body.riskLevel) ?? text(data.riskLevel), payload: webhookPayload(body, verification) as Prisma.InputJsonObject });
    if (!screening) return reply.status(202).send({ received: true, ignored: true, reason: 'unknown tenant' });
    return reply.send({ received: true, screening: { id: screening.id, status: screening.status } });
  });
}
