import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import type { Permission } from '@fauward/internal-rbac';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { staffPermissionContextForPlatformUser } from '../../services/staff-iam.service.js';
import { vendorStatus } from '../../services/vendors/index.js';
import { launchDarklyAdapter } from '../../services/vendors/launchdarkly.adapter.js';
import { personaAdapter } from '../../services/vendors/persona.adapter.js';
import { complyAdvantageAdapter } from '../../services/vendors/complyadvantage.adapter.js';
import { docusignAdapter } from '../../services/vendors/docusign.adapter.js';
import { scheduledJobsQueue } from '../../queues/queues.js';
import { approveSaveOffer, SaveOfferError } from '../../services/save-offer.service.js';
import { writeInternalAudit } from './internal-audit.js';
import { recordWebhookVerification, verifyWebhookHmac, webhookPayload } from './webhook-hmac.js';
import { dangerous } from '../../middleware/dangerous.js';
import { staffSuspensionActor, suspendTenant } from '../../services/tenant-suspension.service.js';
import { FeatureOverrideError, consoleOverrideActor, createFeatureOverride, revokeFeatureOverride } from '../../services/feature-override.service.js';
import { mrrForSubscription } from '../../services/revenue/mrr.service.js';
import { healthScoringModel } from '../../services/health-score.service.js';

type Delegate = {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findFirst: (args?: unknown) => Promise<unknown | null>;
  findUnique: (args: unknown) => Promise<unknown | null>;
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
  upsert: (args: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
};

type RequestWithId = { id: string };
type RequestWithTenant = { tenantId: string };
function readPre(permission: Permission) {
  return [authenticatePlatformSession, requireConsolePermission(permission)];
}

function writePre(permission: Permission) {
  return [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission(permission)];
}

function bodyObject(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? (request.body as Record<string, unknown>)
    : {};
}

function delegate(app: FastifyInstance, name: string): Delegate {
  return (app.prisma as unknown as Record<string, Delegate>)[name];
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(value: unknown, fallback = new Date()) {
  if (typeof value !== 'string') return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function inDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function actorId(request: FastifyRequest) {
  return request.platform!.user.id;
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function optionalJson(value: unknown) {
  return value === undefined ? null : value;
}

async function listWithMeta(model: Delegate, args: unknown = {}) {
  const data = await model.findMany(args);
  return { data };
}

async function createAndAudit(
  request: FastifyRequest,
  model: Delegate,
  data: Record<string, unknown>,
  action: string,
  targetType: string,
  reason?: string | null
) {
  const created = await model.create({ data });
  const targetId = typeof created === 'object' && created && 'id' in created ? String((created as { id: unknown }).id) : targetType;
  await writeInternalAudit(request, action, targetType, targetId, null, created, reason);
  return created;
}

async function updateAndAudit(
  request: FastifyRequest,
  model: Delegate,
  id: string,
  data: Record<string, unknown>,
  action: string,
  targetType: string,
  reason?: string | null
) {
  const before = await model.findUnique({ where: { id } });
  const after = await model.update({ where: { id }, data });
  await writeInternalAudit(request, action, targetType, id, before, after, reason);
  return after;
}

export async function registerInternalConsolePhaseRoutes(app: FastifyInstance) {
  registerContracts(app);
  registerGtm(app);
}

function registerContracts(app: FastifyInstance) {
  app.get('/api/internal/contracts/quotes', { preHandler: readPre('gtm.contracts.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'salesQuote'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/internal/contracts/quotes', { preHandler: writePre('gtm.contracts.write') }, async (request, reply) => {
    const body = bodyObject(request);
    const quote = await createAndAudit(request, delegate(app, 'salesQuote'), { tenantId: stringValue(body.tenantId) || null, dealId: stringValue(body.dealId) || null, quoteNumber: `Q-${Date.now()}`, plan: stringValue(body.plan, 'ENTERPRISE'), termMonths: numberValue(body.termMonths, 12), discountPercent: numberValue(body.discountPercent), customFeatures: body.customFeatures ?? [], status: 'DRAFT', createdBy: actorId(request) }, 'contracts.quote.create', 'sales_quote', stringValue(body.reason, 'Create quote'));
    reply.status(201).send(quote);
  });

  app.get('/api/internal/contracts/quotes/:id', { preHandler: readPre('gtm.contracts.read') }, async (request, reply) => {
    const quote = await delegate(app, 'salesQuote').findUnique({ where: { id: (request.params as RequestWithId).id } });
    if (!quote) return reply.status(404).send({ error: 'Quote not found' });
    reply.send(quote);
  });

  app.post('/api/internal/contracts/quotes/:id/approve', { preHandler: writePre('gtm.contracts.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const quote = await delegate(app, 'salesQuote').findUnique({ where: { id } }) as { discountPercent?: number | string } | null;
    if (!quote) return reply.status(404).send({ error: 'Quote not found' });
    const discount = Number(quote.discountPercent ?? 0);
    const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
    if (discount > 25 && !context.permissions.includes('revenue.subscriptions.override')) return reply.status(403).send({ error: 'CFO approval required', required: 'revenue.subscriptions.override' });
    if (discount >= 10 && !context.permissions.includes('gtm.contracts.discount.large')) return reply.status(403).send({ error: 'Sales manager approval required', required: 'gtm.contracts.discount.large' });
    const after = await updateAndAudit(request, delegate(app, 'salesQuote'), id, { status: 'APPROVED', approvedBy: actorId(request) }, 'contracts.quote.approve', 'sales_quote', stringValue(bodyObject(request).reason, 'Quote approved'));
    reply.send(after);
  });

  app.post('/api/internal/contracts/quotes/:id/send', { preHandler: writePre('gtm.contracts.write') }, async (request, reply) => {
    const vendor = vendorStatus('docusign');
    if (vendor) return reply.status(503).send({ error: 'DOCUSIGN_NOT_CONFIGURED', vendor });
    const { id } = request.params as RequestWithId;
    // The quote PDF and signers arrive with WP-4.19; the adapter refuses an envelope without them (502 VENDOR_ERROR).
    const envelope = await docusignAdapter.createEnvelope({ emailSubject: `Fauward quote ${id}`, document: { name: `quote-${id}.pdf`, fileExtension: 'pdf', base64: '' }, signers: [] });
    const envelopeId = envelope.envelopeId;
    const after = await updateAndAudit(request, delegate(app, 'salesQuote'), id, { status: 'SENT_FOR_SIGNATURE', docusignEnvelopeId: envelopeId }, 'contracts.quote.send_for_signature', 'sales_quote', stringValue(bodyObject(request).reason, 'Send to DocuSign'));
    reply.send(after);
  });

  app.post('/api/internal/contracts/webhooks/docusign', async (request, reply) => {
    const verification = verifyWebhookHmac(request, reply, {
      envName: 'DOCUSIGN_WEBHOOK_SECRET',
      signatureHeaderNames: ['x-docusign-signature-1'],
      timestampHeaderNames: ['x-docusign-timestamp', 'x-docusign-delivery-timestamp'],
      scheme: 'docusign'
    });
    if (!verification) return;
    await recordWebhookVerification(app, 'docusign', verification);
    const body = bodyObject(request);
    const data = nestedRecord(body.data);
    const envelopeId = stringValue(body.envelopeId, stringValue(data.envelopeId));
    const status = stringValue(body.status, stringValue(data.status, 'UNKNOWN')).toUpperCase();
    if (!envelopeId) return reply.status(202).send({ received: true, ignored: true, reason: 'missing envelope id' });

    const quote = await delegate(app, 'salesQuote').findFirst({ where: { docusignEnvelopeId: envelopeId } }) as { id?: string; tenantId?: string; plan?: string; termMonths?: number; customFeatures?: unknown } | null;
    if (!quote?.id) return reply.status(202).send({ received: true, ignored: true, reason: 'quote not found' });

    const updated = await delegate(app, 'salesQuote').update({
      where: { id: quote.id },
      data: { status: status === 'COMPLETED' ? 'SIGNED' : status, signedPdfS3Key: stringValue(body.signedPdfS3Key, stringValue(data.signedPdfS3Key)) || undefined }
    });

    let contract: unknown = null;
    if (status === 'COMPLETED' && quote.tenantId) {
      contract = await delegate(app, 'customContract').create({
        data: {
          tenantId: quote.tenantId,
          msaUrl: stringValue(body.signedPdfS3Key, stringValue(data.signedPdfS3Key)) || null,
          termStart: new Date(),
          termEnd: inDays(Math.max(30, Number(quote.termMonths ?? 12) * 30)),
          terms: { sourceQuoteId: quote.id, plan: quote.plan, customFeatures: optionalJson(quote.customFeatures), webhookVerification: verification },
          status: 'ACTIVE',
          signedAt: new Date()
        }
      });
    }

    reply.send({ received: true, quote: updated, contract });
  });

  app.get('/api/internal/contracts/discounts', { preHandler: readPre('gtm.contracts.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'salesQuote'), { where: { status: 'APPROVAL_REQUIRED' }, orderBy: { createdAt: 'asc' } }));
  });

  app.get('/api/internal/contracts/msas', { preHandler: readPre('gtm.contracts.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'msaAgreement'), { orderBy: { createdAt: 'desc' } }));
  });
}

function registerGtm(app: FastifyInstance) {
  app.get('/api/internal/pipeline', { preHandler: readPre('gtm.pipeline.read') }, async (_request, reply) => {
    reply.send({ ...(await listWithMeta(delegate(app, 'salesDeal'), { orderBy: { closeDate: 'asc' }, take: 100 })), vendor: vendorStatus('hubspot') });
  });

  app.get('/api/internal/pipeline/forecasting', { preHandler: readPre('gtm.pipeline.read') }, async (_request, reply) => {
    const deals = await delegate(app, 'salesDeal').findMany({ where: { stage: { notIn: ['WON', 'LOST'] } }, orderBy: { closeDate: 'asc' }, take: 100 });
    reply.send({ data: deals });
  });

  app.get('/api/internal/pipeline/:dealId', { preHandler: readPre('gtm.pipeline.read') }, async (request, reply) => {
    const deal = await delegate(app, 'salesDeal').findUnique({ where: { id: (request.params as { dealId: string }).dealId } });
    if (!deal) return reply.status(404).send({ error: 'Deal not found' });
    reply.send(deal);
  });
}
