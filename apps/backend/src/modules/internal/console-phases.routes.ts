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
  registerDunning(app);
  registerSuccess(app);
  registerSecurity(app);
  registerKyc(app);
  registerTax(app);
  registerContracts(app);
  registerQbr(app);
  registerGtm(app);
}

// Dunning is about Fauward billing tenants: every ledger query here is kind PLATFORM (D4).
function registerDunning(app: FastifyInstance) {
  app.get('/api/internal/dunning/failed-payments', { preHandler: readPre('revenue.dunning.read') }, async (_request, reply) => {
    const [payments, overdueInvoices] = await Promise.all([
      app.prisma.payment.findMany({
        where: { kind: 'PLATFORM', status: 'FAILED' },
        include: { tenant: { select: { id: true, name: true, slug: true, status: true } }, invoice: true },
        orderBy: { updatedAt: 'desc' },
        take: 100
      }),
      app.prisma.invoice.findMany({
        where: { kind: 'PLATFORM', status: 'OVERDUE' },
        include: { tenant: { select: { id: true, name: true, slug: true, status: true } }, payments: { where: { kind: 'PLATFORM' } } },
        orderBy: { dueDate: 'asc' },
        take: 100
      })
    ]);
    reply.send({ data: payments, overdueInvoices });
  });

  app.get('/api/internal/dunning/timeline/:tenantId', { preHandler: readPre('revenue.dunning.read') }, async (request, reply) => {
    const { tenantId } = request.params as RequestWithTenant;
    const [events, saveOffers, invoices] = await Promise.all([
      delegate(app, 'dunningEvent').findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      delegate(app, 'saveOffer').findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      app.prisma.invoice.findMany({ where: { kind: 'PLATFORM', tenantId }, include: { payments: { where: { kind: 'PLATFORM' } } }, orderBy: { createdAt: 'desc' }, take: 30 })
    ]);
    reply.send({ events, saveOffers, invoices });
  });

  app.post('/api/internal/dunning/retry/:invoiceId', { preHandler: writePre('revenue.dunning.write') }, async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const invoice = await app.prisma.invoice.findUnique({ where: { kind: 'PLATFORM', id: invoiceId }, include: { tenant: true } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    const attempt = await delegate(app, 'dunningEvent').count({ where: { invoiceId, eventType: 'manual_retry' } });
    if (attempt >= 3) {
      // D3 caller 2: the retry limit suspends through the one suspension path.
      const result = await suspendTenant(app, {
        tenantId: invoice.tenantId,
        source: 'DUNNING',
        category: 'BILLING',
        reason: `Dunning retry limit exceeded for invoice ${invoice.invoiceNumber ?? invoiceId}`,
        actor: staffSuspensionActor(request),
        sourceRef: invoiceId
      });
      await delegate(app, 'dunningEvent').create({
        data: { tenantId: invoice.tenantId, invoiceId, eventType: 'suspended_after_max_retries', attempt: attempt + 1, actorId: actorId(request) }
      });
      return reply.send({ suspended: true, attempt: attempt + 1, suspension: result.record, tenant: result.tenant });
    }

    const event = await createAndAudit(
      request,
      delegate(app, 'dunningEvent'),
      { tenantId: invoice.tenantId, invoiceId, eventType: 'manual_retry', attempt: attempt + 1, actorId: actorId(request) },
      'dunning.retry',
      'invoice',
      stringValue(bodyObject(request).reason, 'Manual dunning retry')
    );
    reply.status(201).send({ retryQueued: true, attempt: attempt + 1, event });
  });

  app.post('/api/internal/dunning/save-offers', { preHandler: writePre('revenue.dunning.write') }, async (request, reply) => {
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    const discount = numberValue(body.discount);
    if (!tenantId || discount <= 0) return reply.status(400).send({ error: 'tenantId and positive discount are required' });
    const offer = await createAndAudit(
      request,
      delegate(app, 'saveOffer'),
      // WP-2.7: created PENDING; a second, dangerous step approves it and generates the code the tenant redeems.
      { tenantId, discount, expiresAt: dateValue(body.expiresAt, inDays(14)), status: 'PENDING', reason: stringValue(body.reason, 'Save offer') },
      'dunning.save_offer.issue',
      'save_offer',
      stringValue(body.reason, 'Save offer')
    );
    reply.status(201).send(offer);
  });

  app.post('/api/internal/dunning/save-offers/:id/approve', { preHandler: dangerous('revenue.dunning.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    try {
      const offer = await approveSaveOffer(app, request, { id, reason: stringValue(bodyObject(request).reason) });
      await writeInternalAudit(request, 'dunning.save_offer.approve', 'save_offer', id, { status: 'PENDING' }, { status: offer.status, code: offer.code }, stringValue(bodyObject(request).reason), { targetTenantId: offer.tenantId });
      return reply.send({ offer });
    } catch (error) {
      if (error instanceof SaveOfferError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
  });

  app.get('/api/internal/dunning/save-offers', { preHandler: readPre('revenue.dunning.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'saveOffer'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/dunning/sequences', { preHandler: readPre('revenue.dunning.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'dunningSequence'), { include: { dunningSteps: true }, orderBy: { createdAt: 'desc' } }));
  });

  app.patch('/api/internal/dunning/sequences/:id', { preHandler: writePre('revenue.dunning.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const after = await updateAndAudit(
      request,
      delegate(app, 'dunningSequence'),
      id,
      { name: body.name, steps: body.steps, active: body.active },
      'dunning.sequence.update',
      'dunning_sequence',
      stringValue(body.reason, 'Sequence change')
    );
    reply.send(after);
  });
}

function registerSuccess(app: FastifyInstance) {
  app.get('/api/internal/success', { preHandler: readPre('customer.success.read') }, async (_request, reply) => {
    const latest = await delegate(app, 'tenantHealthScore').findMany({ orderBy: { computedAt: 'desc' }, take: 100 });
    reply.send({ data: latest });
  });

  app.get('/api/internal/success/at-risk', { preHandler: readPre('customer.success.read') }, async (_request, reply) => {
    const scores = await app.prisma.tenantHealthScore.findMany({ where: { score: { lt: 45 } }, orderBy: [{ score: 'asc' }, { computedAt: 'desc' }], take: 200 });
    const tenants = await app.prisma.tenant.findMany({
      where: { id: { in: scores.map((score) => score.tenantId) } },
      include: { subscription: true }
    });
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    // WP-3.1: ARR from mrrForSubscription (list price, overrides, contracts, FX) — no plan-price literals.
    const mrrByTenant = new Map(
      await Promise.all(tenants.map(async (tenant) => [tenant.id, await mrrForSubscription(app.prisma, tenant, tenant.subscription)] as const))
    );
    const data = scores
      .map((score) => {
        const tenant = tenantById.get(score.tenantId);
        const mrr = mrrByTenant.get(score.tenantId);
        const arr = mrr ? Number(new Prisma.Decimal(mrr.amount).mul(12).toFixed(2)) : 0;
        const churnProbability = Math.max(0, Math.min(1, (60 - score.score) / 60));
        return { ...score, tenant, arr, arrCurrency: mrr?.currency ?? null, churnProbability, riskPriority: arr * churnProbability };
      })
      .sort((left, right) => right.riskPriority - left.riskPriority || left.score - right.score)
      .slice(0, 100);
    reply.send({ data });
  });

  app.get('/api/internal/success/expansion', { preHandler: readPre('customer.success.read') }, async (_request, reply) => {
    const data = await delegate(app, 'tenantHealthScore').findMany({ where: { score: { gte: 80 } }, orderBy: { computedAt: 'desc' }, take: 100 });
    reply.send({ data });
  });

  app.get('/api/internal/success/playbooks', { preHandler: readPre('customer.success.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'cSPlaybook'), { orderBy: { createdAt: 'desc' } }));
  });

  app.post('/api/internal/success/playbooks', { preHandler: writePre('customer.success.write') }, async (request, reply) => {
    const body = bodyObject(request);
    const playbook = await createAndAudit(
      request,
      delegate(app, 'cSPlaybook'),
      { name: stringValue(body.name, 'Untitled playbook'), trigger: stringValue(body.trigger, 'manual'), steps: body.steps ?? [], active: body.active !== false },
      'success.playbook.create',
      'cs_playbook',
      stringValue(body.reason, 'Create playbook')
    );
    reply.status(201).send(playbook);
  });

  app.get('/api/internal/success/playbooks/:id/runs', { preHandler: readPre('customer.success.read') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    reply.send(await listWithMeta(delegate(app, 'cSPlaybookRun'), { where: { playbookId: id }, orderBy: { createdAt: 'desc' } }));
  });

  // WP-3.3: the model from health-score.config.ts (weights, factor definitions, version), read-only.
  app.get('/api/internal/success/health-scoring', { preHandler: readPre('customer.success.read') }, async (_request, reply) => {
    reply.send(healthScoringModel());
  });

  app.post('/api/internal/success/health-scoring/run', { preHandler: writePre('customer.success.write') }, async (request, reply) => {
    const job = await scheduledJobsQueue.add(
      'customer.health-scoring',
      // WP-3.8: the run row records who started it.
      { triggeredBy: actorId(request), reason: 'Manual health scoring run from the CS console' },
      { jobId: `customer.health-scoring.manual.${Date.now()}` }
    );
    await writeInternalAudit(request, 'success.health_score.enqueue', 'job', 'customer.health-scoring', null, { jobId: String(job.id ?? '') }, 'Manual health scoring run queued');
    reply.status(202).send({ queued: true, jobId: job.id, name: job.name });
  });
}

function registerSecurity(app: FastifyInstance) {
  app.get('/api/internal/security/anomalies', { preHandler: readPre('trust.security.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'securityAnomaly'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/security/logins', { preHandler: readPre('trust.security.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'staffLoginAttempt'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/security/ip-blocks', { preHandler: readPre('trust.security.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'ipBlock'), { orderBy: { createdAt: 'desc' } }));
  });

  app.post('/api/internal/security/ip-blocks', { preHandler: writePre('trust.security.write') }, async (request, reply) => {
    const body = bodyObject(request);
    const ipAddress = stringValue(body.ipAddress);
    if (!ipAddress) return reply.status(400).send({ error: 'ipAddress is required' });
    const block = await createAndAudit(request, delegate(app, 'ipBlock'), { ipAddress, reason: stringValue(body.reason, 'Manual block'), expiresAt: body.expiresAt ? dateValue(body.expiresAt) : null, createdBy: actorId(request) }, 'security.ip_block.create', 'ip_block', stringValue(body.reason, 'Manual block'));
    reply.status(201).send(block);
  });

  app.get('/api/internal/security/sessions', { preHandler: readPre('trust.security.read') }, async (_request, reply) => {
    const data = await app.prisma.staffSession.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, include: { staff: true }, orderBy: { startedAt: 'desc' }, take: 100 });
    reply.send({ data });
  });

  app.post('/api/internal/security/sessions/:id/revoke', { preHandler: writePre('trust.security.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const before = await app.prisma.staffSession.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'Staff session not found' });
    const after = await app.prisma.staffSession.update({ where: { id }, data: { revokedAt: new Date() } });
    if (before.platformSessionId) {
      await app.prisma.platformSession.updateMany({ where: { id: before.platformSessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await writeInternalAudit(request, 'security.session.revoke', 'staff_session', id, before, after, stringValue(bodyObject(request).reason, 'Session revoked'));
    reply.send(after);
  });
}

function registerKyc(app: FastifyInstance) {
  app.get('/api/internal/kyc/pending', { preHandler: readPre('trust.kyc.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'kYCReview'), { where: { status: { in: ['PENDING', 'NEEDS_REVIEW'] } }, orderBy: { createdAt: 'asc' } }));
  });

  app.get('/api/internal/kyc/sanctions', { preHandler: readPre('trust.kyc.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'sanctionsScreening'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/kyc/pep', { preHandler: readPre('trust.kyc.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'sanctionsScreening'), { where: { matchType: 'PEP' }, orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/internal/kyc/inquiries', { preHandler: writePre('trust.kyc.approve') }, async (request, reply) => {
    const vendor = vendorStatus('persona');
    if (vendor) return reply.status(503).send({ error: 'PERSONA_NOT_CONFIGURED', vendor });
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const persona = await personaAdapter.createInquiry({ referenceId: tenantId, name: tenantId });
    const review = await createAndAudit(
      request,
      delegate(app, 'kYCReview'),
      { tenantId, inquiryId: persona.inquiryId, status: 'PENDING', payload: persona },
      'kyc.inquiry.create',
      'kyc_review',
      stringValue(body.reason, 'KYC inquiry')
    );
    reply.status(201).send(review);
  });

  app.post('/api/internal/kyc/inquiries/:id/decision', { preHandler: writePre('trust.kyc.approve') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const decision = stringValue(body.decision);
    const before = await delegate(app, 'kYCReview').findUnique({ where: { id } }) as { tenantId?: string } | null;
    if (!before) return reply.status(404).send({ error: 'KYC review not found' });
    if (decision === 'approve' && before.tenantId) {
      const pepMatch = await delegate(app, 'sanctionsScreening').findFirst({
        where: { tenantId: before.tenantId, matchType: 'PEP', status: { in: ['MATCH', 'PENDING_REVIEW', 'PENDING'] } }
      });
      const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
      if (pepMatch && !context.roles.includes('COMPLIANCE_ADMIN') && !context.roles.includes('ROOT')) {
        return reply.status(403).send({ error: 'PEP match requires senior compliance approval', requiredRole: 'COMPLIANCE_ADMIN' });
      }
    }
    const after = await updateAndAudit(request, delegate(app, 'kYCReview'), id, { decision, status: decision === 'approve' ? 'APPROVED' : 'REJECTED', reviewedBy: actorId(request) }, 'kyc.review.decision', 'kyc_review', stringValue(body.reason, decision));
    if (decision === 'approve' && before.tenantId) {
      await app.prisma.tenant.update({ where: { id: before.tenantId }, data: { kycStatus: 'VERIFIED' } });
    }
    reply.send(after);
  });

  app.post('/api/internal/kyc/screen', { preHandler: writePre('trust.kyc.approve') }, async (request, reply) => {
    const vendor = vendorStatus('complyadvantage');
    if (vendor) return reply.status(503).send({ error: 'COMPLYADVANTAGE_NOT_CONFIGURED', vendor });
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const result = await complyAdvantageAdapter.createSearch({ searchTerm: stringValue(body.searchTerm, tenantId), referenceId: tenantId });
    const matchType = stringValue(body.matchType);
    const status = stringValue(body.status, matchType ? 'MATCH' : 'PENDING');
    const screening = await createAndAudit(
      request,
      delegate(app, 'sanctionsScreening'),
      { tenantId, status, matchType: matchType || null, riskLevel: stringValue(body.riskLevel) || null, payload: { request: body, response: result } },
      'kyc.sanctions.screen',
      'sanctions_screening',
      stringValue(body.reason, 'Manual sanctions screen')
    );
    if (status === 'MATCH' || matchType === 'PEP') {
      await app.prisma.tenant.update({ where: { id: tenantId }, data: { kycStatus: 'PENDING_REVIEW' } });
    }
    reply.status(201).send(screening);
  });

  app.post('/api/internal/kyc/webhooks/persona', async (request, reply) => {
    const verification = verifyWebhookHmac(request, reply, {
      envName: 'PERSONA_WEBHOOK_SECRET',
      signatureHeaderNames: ['persona-signature'],
      timestampHeaderNames: ['persona-timestamp'],
      scheme: 'persona'
    });
    if (!verification) return;
    await recordWebhookVerification(app, 'persona', verification);
    const body = bodyObject(request);
    const data = nestedRecord(body.data);
    const attributes = nestedRecord(data.attributes);
    const inquiryId = stringValue(data.id, stringValue(body.inquiryId, stringValue(attributes.id)));
    const tenantId = stringValue(body.tenantId, stringValue(attributes.referenceId, stringValue(attributes['reference-id'])));
    const status = stringValue(attributes.status, stringValue(body.status, 'NEEDS_REVIEW'));

    if (!inquiryId && !tenantId) return reply.status(202).send({ received: true, ignored: true, reason: 'missing inquiry or tenant reference' });

    const existing = inquiryId ? await delegate(app, 'kYCReview').findFirst({ where: { inquiryId } }) as { id?: string; tenantId?: string } | null : null;
    const review = existing?.id
      ? await delegate(app, 'kYCReview').update({ where: { id: existing.id }, data: { status, payload: webhookPayload(body, verification) } })
      : await delegate(app, 'kYCReview').create({ data: { tenantId: tenantId || 'unmatched-persona-webhook', inquiryId: inquiryId || null, status, payload: webhookPayload(body, verification) } });

    reply.send({ received: true, review });
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
    const body = bodyObject(request);
    const data = nestedRecord(body.data);
    const tenantId = stringValue(body.tenantId, stringValue(body.client_ref, stringValue(data.client_ref)));
    if (!tenantId) return reply.status(202).send({ received: true, ignored: true, reason: 'missing tenant reference' });

    const matchType = stringValue(body.matchType, stringValue(data.matchType));
    const status = stringValue(body.status, matchType ? 'MATCH' : 'PENDING_REVIEW');
    const screening = await delegate(app, 'sanctionsScreening').create({
      data: { tenantId, provider: 'complyadvantage', status, matchType: matchType || null, riskLevel: stringValue(body.riskLevel, stringValue(data.riskLevel)) || null, payload: webhookPayload(body, verification) }
    });
    if (status === 'MATCH' || matchType === 'PEP') {
      await app.prisma.tenant.update({ where: { id: tenantId }, data: { kycStatus: 'PENDING_REVIEW' } });
    }
    reply.send({ received: true, screening });
  });
}

function registerTax(app: FastifyInstance) {
  app.get('/api/internal/tax', { preHandler: readPre('revenue.tax.read') }, async (_request, reply) => {
    const [registrations, returns] = await Promise.all([
      delegate(app, 'taxRegistration').findMany({ orderBy: { region: 'asc' } }),
      delegate(app, 'taxReturn').findMany({ orderBy: { periodStart: 'desc' }, take: 20 })
    ]);
    reply.send({ registrations, returns, vendors: { stripeTax: Boolean(process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY), anrok: !vendorStatus('anrok') } });
  });

  app.get('/api/internal/tax/returns', { preHandler: readPre('revenue.tax.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'taxReturn'), { orderBy: { periodStart: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/tax/registrations', { preHandler: readPre('revenue.tax.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'taxRegistration'), { orderBy: { region: 'asc' } }));
  });

  app.get('/api/internal/tax/exemptions', { preHandler: readPre('revenue.tax.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'taxExemption'), { orderBy: { createdAt: 'desc' } }));
  });

  app.post('/api/internal/tax/exemptions/:id/approve', { preHandler: writePre('revenue.tax.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const exemption = await delegate(app, 'taxExemption').findUnique({ where: { id } }) as { tenantId?: string } | null;
    if (!exemption) return reply.status(404).send({ error: 'Tax exemption not found' });
    const after = await updateAndAudit(request, delegate(app, 'taxExemption'), id, { status: 'APPROVED', approvedBy: actorId(request), approvedAt: new Date() }, 'tax.exemption.approve', 'tax_exemption', stringValue(bodyObject(request).reason, 'Tax exemption approved'));
    if (exemption.tenantId) await app.prisma.tenant.update({ where: { id: exemption.tenantId }, data: { taxExempt: true } });
    reply.send(after);
  });
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

function registerQbr(app: FastifyInstance) {
  app.get('/api/internal/qbr', { preHandler: readPre('customer.qbr.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'qBRDeck'), { orderBy: { periodEnd: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/qbr/templates', { preHandler: readPre('customer.qbr.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'qBRTemplate'), { orderBy: { segment: 'asc' } }));
  });

  app.get('/api/internal/qbr/:tenantId', { preHandler: readPre('customer.qbr.read') }, async (request, reply) => {
    const { tenantId } = request.params as RequestWithTenant;
    const data = await delegate(app, 'qBRDeck').findMany({ where: { tenantId }, orderBy: { periodEnd: 'desc' }, take: 10 });
    reply.send({ data });
  });

  app.post('/api/internal/qbr/:tenantId/generate', { preHandler: writePre('customer.qbr.write') }, async (request, reply) => {
    const { tenantId } = request.params as RequestWithTenant;
    const now = new Date();
    const deck = await createAndAudit(request, delegate(app, 'qBRDeck'), { tenantId, periodStart: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), periodEnd: now, status: 'DRAFT', html: '<h1>QBR</h1>', nextQbrAt: inDays(90) }, 'qbr.deck.generate', 'qbr_deck', stringValue(bodyObject(request).reason, 'Generate QBR deck'));
    reply.status(201).send(deck);
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

  app.get('/api/internal/trials', { preHandler: readPre('gtm.trials.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'trialActivation'), { orderBy: { updatedAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/trials/expiring', { preHandler: readPre('gtm.trials.read') }, async (_request, reply) => {
    const data = await app.prisma.subscription.findMany({ where: { status: 'TRIALING', trialEnd: { lte: inDays(7), gte: new Date() } }, include: { tenant: true } });
    reply.send({ data });
  });

  app.get('/api/internal/trials/extensions', { preHandler: readPre('gtm.trials.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'trialExtensionRequest'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/internal/trials/extensions/:id/approve', { preHandler: writePre('gtm.trials.extend') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const row = await delegate(app, 'trialExtensionRequest').findUnique({ where: { id } }) as { requestedDays?: number } | null;
    if (!row) return reply.status(404).send({ error: 'Extension request not found' });
    const days = Number(row.requestedDays ?? 0);
    const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
    if (days > 30 && !context.roles.includes('SALES_DIRECTOR') && !context.roles.includes('ROOT')) return reply.status(403).send({ error: 'SALES_DIRECTOR approval required' });
    if (days > 7 && !context.roles.includes('SALES_MANAGER') && !context.roles.includes('SALES_DIRECTOR') && !context.roles.includes('ROOT')) return reply.status(403).send({ error: 'SALES_MANAGER approval required' });
    const after = await updateAndAudit(request, delegate(app, 'trialExtensionRequest'), id, { status: 'APPROVED', approvedBy: actorId(request) }, 'trials.extension.approve', 'trial_extension', stringValue(bodyObject(request).reason, 'Trial extension approved'));
    reply.send(after);
  });

  app.get('/api/internal/trials/:tenantId', { preHandler: readPre('gtm.trials.read') }, async (request, reply) => {
    const data = await delegate(app, 'trialActivation').findUnique({ where: { tenantId: (request.params as RequestWithTenant).tenantId } });
    reply.send(data ?? { tenantId: (request.params as RequestWithTenant).tenantId, score: 0 });
  });

  app.get('/api/internal/demos', { preHandler: readPre('gtm.demos.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'demoEnvironment'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/internal/demos', { preHandler: writePre('gtm.demos.write') }, async (request, reply) => {
    const body = bodyObject(request);
    const template = stringValue(body.template, 'logistics-3pl');
    const tenant = await app.prisma.tenant.create({
      data: {
        name: stringValue(body.name, `Demo ${template}`),
        slug: `demo-${Date.now()}`,
        plan: 'TRIALING',
        status: 'DEMO',
        demoExpiresAt: dateValue(body.expiresAt, inDays(30))
      }
    });
    const demo = await createAndAudit(request, delegate(app, 'demoEnvironment'), { tenantId: tenant.id, template, expiresAt: tenant.demoExpiresAt ?? inDays(30), status: 'ACTIVE', createdBy: actorId(request), shareTokenHash: `demo_${tenant.id}` }, 'demos.create', 'demo_environment', stringValue(body.reason, 'Create demo environment'));
    reply.status(201).send({ tenant, demo });
  });

  app.get('/api/internal/demos/templates', { preHandler: readPre('gtm.demos.read') }, async (_request, reply) => {
    reply.send({ data: ['logistics-3pl', 'retail', 'manufacturing'] });
  });

  app.get('/api/internal/handoff/won', { preHandler: readPre('gtm.handoff.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'salesDeal'), { where: { stage: 'WON' }, orderBy: { updatedAt: 'desc' } }));
  });

  app.get('/api/internal/handoff/onboarding-queue', { preHandler: readPre('gtm.handoff.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'salesHandoff'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/handoff/templates', { preHandler: readPre('gtm.handoff.read') }, async (_request, reply) => {
    reply.send({ data: [{ id: 'default', name: 'Default handoff', fields: ['stakeholders', 'successCriteria', 'risks'] }] });
  });

  app.get('/api/internal/attribution', { preHandler: readPre('gtm.attribution.read') }, async (_request, reply) => {
    reply.send({ ...(await listWithMeta(delegate(app, 'marketingAttribution'), { orderBy: { periodStart: 'desc' }, take: 100 })), vendor: null });
  });

  app.get('/api/internal/attribution/campaigns', { preHandler: readPre('gtm.attribution.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'marketingAttribution'), { where: { campaign: { not: null } }, orderBy: { periodStart: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/attribution/funnel', { preHandler: readPre('gtm.attribution.read') }, async (_request, reply) => {
    reply.send({ data: [] });
  });

  app.get('/api/internal/attribution/landing-pages', { preHandler: readPre('gtm.attribution.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'marketingAttribution'), { where: { landingPage: { not: null } }, orderBy: { periodStart: 'desc' }, take: 100 }));
  });
}
