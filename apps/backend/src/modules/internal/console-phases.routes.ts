import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PERMISSIONS, type Permission } from '@fauward/internal-rbac';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireInternalPermission } from '../../middleware/require-internal-permission.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { staffPermissionContextForPlatformUser } from '../../services/staff-iam.service.js';
import { vendorJson, vendorUnavailable } from '../../services/internal-vendors.service.js';
import { activeLegalHoldForTenant } from '../../services/legal-hold.service.js';
import { scheduledJobsQueue } from '../../queues/queues.js';
import { writeInternalAudit } from './internal-audit.js';

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
type WebhookVerification = {
  signature: string;
  timestamp: string;
  verifiedAt: string;
};

type WebhookHmacOptions = {
  envName: string;
  signatureHeaderNames: string[];
  timestampHeaderNames: string[];
  scheme: 'pagerduty' | 'persona' | 'docusign' | 'complyadvantage';
  webhookIdHeaderNames?: string[];
};

const DSAR_STATES = [
  'RECEIVED',
  'IDENTITY_VERIFIED',
  'DATA_GATHERED',
  'REVIEWED',
  'RESPONSE_DRAFTED',
  'APPROVED',
  'DELIVERED',
  'CLOSED'
];

function readPre(permission: Permission) {
  return [authenticatePlatformSession, requireInternalPermission(permission)];
}

function writePre(permission: Permission) {
  return [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission(permission)];
}

function bodyObject(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? (request.body as Record<string, unknown>)
    : {};
}

function queryObject(request: FastifyRequest): Record<string, string | undefined> {
  return request.query && typeof request.query === 'object' ? (request.query as Record<string, string | undefined>) : {};
}

function delegate(app: FastifyInstance, name: string): Delegate {
  return (app.prisma as unknown as Record<string, Delegate>)[name];
}

function optionalDelegate(app: FastifyInstance, name: string): Delegate | null {
  const value = (app.prisma as unknown as Record<string, Delegate | undefined>)[name];
  return value && typeof value.upsert === 'function' ? value : null;
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

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name.toLowerCase()];
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
}

function rawBodyString(request: FastifyRequest) {
  if (request.rawBody) return request.rawBody.toString('utf8');
  if (Buffer.isBuffer(request.body)) return request.body.toString('utf8');
  if (typeof request.body === 'string') return request.body;
  return JSON.stringify(request.body ?? {});
}

function timestampFromHeaders(request: FastifyRequest, signatureHeader: string | undefined, timestampHeaderNames: string[]) {
  const explicit = timestampHeaderNames.map((name) => headerValue(request, name)).find(Boolean);
  if (explicit) return explicit;
  const embedded = signatureHeader?.split(',').map((part) => part.trim()).find((part) => part.toLowerCase().startsWith('t='));
  return embedded?.slice(2).trim();
}

function timestampToMs(timestamp: string) {
  if (/^\d+$/.test(timestamp)) {
    const numeric = Number(timestamp);
    return timestamp.length <= 10 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

function secureStringEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hmacDigest(secret: string | Buffer, payload: string | Buffer) {
  return createHmac('sha256', secret).update(payload).digest();
}

function signatureList(header: string | undefined, marker?: string) {
  if (!header) return [];
  if (!marker) return header.split(/\s+/).map((part) => part.trim()).filter(Boolean);

  const normalizedMarker = marker.toLowerCase();
  const extractMarked = (part: string) => {
    const lowerPart = part.toLowerCase();
    if (lowerPart.startsWith(`${normalizedMarker}=`)) return part.slice(marker.length + 1);
    if (lowerPart.startsWith(`${normalizedMarker},`)) return part.slice(marker.length + 1);
    return null;
  };

  return header
    .split(/\s+/)
    .map((part) => part.trim())
    .flatMap((part) => {
      if (!part) return [];
      const direct = extractMarked(part);
      if (direct) return [direct];
      const commaPart = part.split(',').map((piece) => piece.trim()).map(extractMarked).find(Boolean);
      if (commaPart) return [commaPart];
      return [];
    })
    .filter(Boolean);
}

function base64Secret(secret: string) {
  return Buffer.from(secret, 'base64');
}

function expectedWebhookSignatures(options: WebhookHmacOptions, secret: string, timestamp: string, rawBody: string, webhookId: string | undefined) {
  if (options.scheme === 'pagerduty') {
    return {
      signatures: [hmacDigest(secret, rawBody).toString('hex')],
      marker: 'v1'
    };
  }

  if (options.scheme === 'persona') {
    return {
      signatures: [hmacDigest(secret, `${timestamp}.${rawBody}`).toString('hex')],
      marker: 'v1'
    };
  }

  if (options.scheme === 'docusign') {
    const digest = hmacDigest(secret, rawBody);
    return {
      signatures: [digest.toString('base64'), digest.toString('hex')],
      marker: undefined
    };
  }

  if (!webhookId) {
    return {
      signatures: [],
      marker: 'v1'
    };
  }

  const digest = hmacDigest(base64Secret(secret), `${webhookId}.${timestamp}.${rawBody}`);
  return {
    signatures: [digest.toString('base64')],
    marker: 'v1'
  };
}

function verifyWebhookHmac(
  request: FastifyRequest,
  reply: FastifyReply,
  options: WebhookHmacOptions
): WebhookVerification | null {
  const secret = process.env[options.envName];
  if (!secret) {
    reply.status(503).send({ error: `${options.envName}_NOT_CONFIGURED` });
    return null;
  }

  const signatureHeader = options.signatureHeaderNames.map((name) => headerValue(request, name)).find(Boolean);
  if (!signatureHeader) {
    reply.status(403).send({ error: 'Invalid webhook signature' });
    return null;
  }

  const timestamp = timestampFromHeaders(request, signatureHeader, options.timestampHeaderNames);
  const signedAtMs = timestamp ? timestampToMs(timestamp) : null;
  if (!timestamp || signedAtMs === null) {
    reply.status(403).send({ error: 'Invalid webhook signature' });
    return null;
  }

  if (Math.abs(Date.now() - signedAtMs) > 5 * 60 * 1000) {
    reply.status(400).send({ error: 'Webhook timestamp too old' });
    return null;
  }

  const webhookId = options.webhookIdHeaderNames?.map((name) => headerValue(request, name)).find(Boolean);
  if (options.scheme === 'complyadvantage' && !webhookId) {
    reply.status(403).send({ error: 'Invalid webhook signature' });
    return null;
  }

  const { signatures: expectedCandidates, marker } = expectedWebhookSignatures(options, secret, timestamp, rawBodyString(request), webhookId);
  const actualCandidates = signatureList(signatureHeader, marker);
  const valid = actualCandidates.some((actual) => expectedCandidates.some((expected) => secureStringEquals(actual, expected)));
  if (!valid) {
    reply.status(403).send({ error: 'Invalid webhook signature' });
    return null;
  }

  return {
    signature: actualCandidates[0],
    timestamp,
    verifiedAt: new Date().toISOString()
  };
}

function webhookPayload(body: Record<string, unknown>, verification: WebhookVerification) {
  return { ...body, _webhookVerification: verification };
}

async function recordWebhookVerification(app: FastifyInstance, vendor: string, verification: WebhookVerification) {
  const model = optionalDelegate(app, 'integrationProviderStatus');
  if (!model) return;
  const payload = { lastWebhookVerification: verification };
  await model.upsert({
    where: { provider: vendor },
    create: { provider: vendor, status: 'WEBHOOK_VERIFIED', lastSuccessfulAt: new Date(), payload },
    update: { status: 'WEBHOOK_VERIFIED', lastSuccessfulAt: new Date(), checkedAt: new Date(), payload }
  });
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function optionalJson(value: unknown) {
  return value === undefined ? null : value;
}

function assertPermissionValue(value: unknown): Permission | null {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value) ? (value as Permission) : null;
}

async function requireNoActiveLegalHold(app: FastifyInstance, tenantId: string | undefined | null, reply: FastifyReply) {
  const hold = await activeLegalHoldForTenant(app.prisma, tenantId);
  if (hold) {
    reply.status(409).send({ error: 'LEGAL_HOLD_ACTIVE', tenantId, holdId: hold.id });
    return false;
  }
  return true;
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
  registerIncidents(app);
  registerSupport(app);
  registerSuccess(app);
  registerJit(app);
  registerCompliance(app);
  registerSafety(app);
  registerFlags(app);
  registerSecrets(app);
  registerSecurity(app);
  registerKyc(app);
  registerIntegrations(app);
  registerTax(app);
  registerSubscriptions(app);
  registerContracts(app);
  registerQbr(app);
  registerGtm(app);
}

function registerDunning(app: FastifyInstance) {
  app.get('/api/internal/dunning/failed-payments', { preHandler: readPre('revenue.dunning.read') }, async (_request, reply) => {
    const [payments, overdueInvoices] = await Promise.all([
      app.prisma.payment.findMany({
        where: { status: 'FAILED' },
        include: { tenant: { select: { id: true, name: true, slug: true, status: true } }, invoice: true },
        orderBy: { updatedAt: 'desc' },
        take: 100
      }),
      app.prisma.invoice.findMany({
        where: { status: 'OVERDUE' },
        include: { tenant: { select: { id: true, name: true, slug: true, status: true } }, payments: true },
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
      app.prisma.invoice.findMany({ where: { tenantId }, include: { payments: true }, orderBy: { createdAt: 'desc' }, take: 30 })
    ]);
    reply.send({ events, saveOffers, invoices });
  });

  app.post('/api/internal/dunning/retry/:invoiceId', { preHandler: writePre('revenue.dunning.write') }, async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const invoice = await app.prisma.invoice.findUnique({ where: { id: invoiceId }, include: { tenant: true } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });

    const attempt = await delegate(app, 'dunningEvent').count({ where: { invoiceId, eventType: 'manual_retry' } });
    if (attempt >= 3) {
      const before = invoice.tenant;
      const after = await app.prisma.tenant.update({ where: { id: invoice.tenantId }, data: { status: 'SUSPENDED' } });
      await delegate(app, 'dunningEvent').create({
        data: { tenantId: invoice.tenantId, invoiceId, eventType: 'suspended_after_max_retries', attempt: attempt + 1, actorId: actorId(request) }
      });
      await writeInternalAudit(request, 'dunning.tenant.suspend_after_retry_limit', 'tenant', invoice.tenantId, before, after, 'Dunning retry limit exceeded');
      return reply.send({ suspended: true, attempt: attempt + 1, tenant: after });
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
      { tenantId, discount, expiresAt: dateValue(body.expiresAt, inDays(14)), status: 'APPROVED', approvedBy: actorId(request), reason: stringValue(body.reason, 'Save offer') },
      'dunning.save_offer.issue',
      'save_offer',
      stringValue(body.reason, 'Save offer')
    );
    reply.status(201).send(offer);
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

function registerIncidents(app: FastifyInstance) {
  app.get('/api/internal/incidents', { preHandler: readPre('platform.incidents.read') }, async (_request, reply) => {
    const vendor = vendorUnavailable('pagerduty');
    const data = await delegate(app, 'incidentRecord').findMany({ include: { impacts: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    reply.send({ data, vendor });
  });

  app.get('/api/internal/incidents/:id', { preHandler: readPre('platform.incidents.read') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const incident = await delegate(app, 'incidentRecord').findUnique({ where: { id }, include: { impacts: true } });
    if (!incident) return reply.status(404).send({ error: 'Incident not found' });
    reply.send(incident);
  });

  app.post('/api/internal/incidents/:id/impacts', { preHandler: writePre('platform.incidents.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const impact = await delegate(app, 'incidentTenantImpact').upsert({
      where: { incidentId_tenantId: { incidentId: id, tenantId } },
      create: { incidentId: id, tenantId, impactLevel: stringValue(body.impactLevel, 'AFFECTED'), notes: stringValue(body.notes) || null },
      update: { impactLevel: stringValue(body.impactLevel, 'AFFECTED'), notes: stringValue(body.notes) || null }
    });
    const incident = await delegate(app, 'incidentRecord').findUnique({ where: { id } }) as { title?: string; resolvedAt?: Date | null } | null;
    await app.prisma.platformAnnouncement.create({
      data: {
        type: 'WARNING',
        title: incident?.title ? `Service notice: ${incident.title}` : 'Service notice',
        body: stringValue(body.portalMessage, stringValue(body.notes, 'A Fauward service incident may be affecting your workspace.')),
        targetAll: false,
        tenantIds: [tenantId],
        planTiers: [],
        dismissible: false,
        expiresAt: incident?.resolvedAt ?? null,
        createdBy: actorId(request)
      }
    });
    await writeInternalAudit(request, 'incident.impact.annotate', 'incident', id, null, impact, stringValue(body.reason, 'Incident impact annotation'));
    reply.send(impact);
  });

  app.post('/api/internal/incidents/webhooks/pagerduty', async (request, reply) => {
    const verification = verifyWebhookHmac(request, reply, {
      envName: 'PAGERDUTY_WEBHOOK_SECRET',
      signatureHeaderNames: ['x-pagerduty-signature'],
      timestampHeaderNames: ['x-pagerduty-request-timestamp', 'x-pagerduty-webhook-timestamp'],
      scheme: 'pagerduty'
    });
    if (!verification) return;
    await recordWebhookVerification(app, 'pagerduty', verification);
    const body = bodyObject(request);
    const event = (body.event && typeof body.event === 'object' ? body.event : body) as Record<string, unknown>;
    const incident = (event.incident && typeof event.incident === 'object' ? event.incident : event) as Record<string, unknown>;
    const payload = webhookPayload(body, verification);
    const vendorId = stringValue(incident.id, `pd_${Date.now()}`);
    const record = await delegate(app, 'incidentRecord').upsert({
      where: { vendorId },
      create: {
        vendor: 'pagerduty',
        vendorId,
        title: stringValue(incident.title, stringValue(incident.summary, 'PagerDuty incident')),
        status: stringValue(incident.status, 'triggered'),
        severity: stringValue(incident.urgency, 'medium'),
        payload
      },
      update: {
        title: stringValue(incident.title, stringValue(incident.summary, 'PagerDuty incident')),
        status: stringValue(incident.status, 'triggered'),
        severity: stringValue(incident.urgency, 'medium'),
        payload
      }
    });
    reply.send({ received: true, incident: record });
  });

  app.get('/api/internal/incidents/runbooks', { preHandler: readPre('platform.incidents.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'incidentRunbook'), { orderBy: { title: 'asc' } }));
  });
}

function registerSupport(app: FastifyInstance) {
  app.get('/api/internal/support/tickets', { preHandler: readPre('customer.support.read') }, async (request, reply) => {
    const query = queryObject(request);
    const tenantId = query.tenantId;
    const data = await app.prisma.supportTicket.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 5 }
      }
    });
    reply.send({ data });
  });

  app.post('/api/internal/support/tickets', { preHandler: writePre('customer.support.write') }, async (request, reply) => {
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const author = await app.prisma.user.findFirst({
      where: {
        tenantId,
        isActive: true,
        ...(stringValue(body.requesterEmail) ? { email: stringValue(body.requesterEmail).toLowerCase() } : {})
      },
      orderBy: { createdAt: 'asc' }
    });
    const fallbackAuthor = author ?? await app.prisma.user.findFirst({
      where: { tenantId, role: { in: ['TENANT_ADMIN', 'TENANT_MANAGER'] }, isActive: true },
      orderBy: { createdAt: 'asc' }
    });
    if (!fallbackAuthor) return reply.status(400).send({ error: 'No active tenant user available for ticket authoring' });

    const count = await app.prisma.supportTicket.count({ where: { tenantId } });
    const ticket = await app.prisma.supportTicket.create({
      data: {
        tenantId,
        ticketNumber: `SA-${Date.now()}-${String(count + 1).padStart(4, '0')}`,
        customerId: fallbackAuthor.id,
        subject: stringValue(body.subject, 'Tenant support request'),
        category: stringValue(body.category, 'OTHER') as never,
        priority: stringValue(body.priority, 'NORMAL').toUpperCase() as never,
        messages: {
          create: {
            tenantId,
            authorId: fallbackAuthor.id,
            body: stringValue(body.message, stringValue(body.body, 'Support ticket created from the Super Admin console.')),
            fromSA: true,
            platformAuthorId: actorId(request)
          }
        }
      },
      include: { messages: true }
    });
    await writeInternalAudit(request, 'support.ticket.create', 'support_ticket', ticket.id, null, ticket, stringValue(body.reason, 'Created support ticket'));
    reply.status(201).send(ticket);
  });

  app.get('/api/internal/support/tickets/:id', { preHandler: readPre('customer.support.read') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const ticket = await app.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, email: true, firstName: true, lastName: true } } } }
      }
    });
    if (!ticket) return reply.status(404).send({ error: 'Support ticket not found' });
    reply.send(ticket);
  });

  app.patch('/api/internal/support/tickets/:id', { preHandler: writePre('customer.support.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const before = await app.prisma.supportTicket.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'Support ticket not found' });
    const after = await app.prisma.supportTicket.update({
      where: { id },
      data: {
        status: stringValue(body.status, before.status) as never,
        priority: stringValue(body.priority, before.priority).toUpperCase() as never,
        assignedTo: stringValue(body.assignedTo) || undefined
      }
    });
    await writeInternalAudit(request, 'support.ticket.update', 'support_ticket', id, before, after, stringValue(body.reason, 'Support ticket update'));
    reply.send(after);
  });

  app.post('/api/internal/support/tickets/:id/reply', { preHandler: writePre('customer.support.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const text = stringValue(body.body, stringValue(body.message));
    if (!text) return reply.status(400).send({ error: 'body is required' });
    const ticket = await app.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) return reply.status(404).send({ error: 'Support ticket not found' });
    const author = ticket.customerId
      ? await app.prisma.user.findFirst({ where: { id: ticket.customerId, tenantId: ticket.tenantId } })
      : await app.prisma.user.findFirst({ where: { tenantId: ticket.tenantId, role: { in: ['TENANT_ADMIN', 'TENANT_MANAGER'] }, isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!author) return reply.status(400).send({ error: 'No tenant user available for reply authoring' });

    const message = await app.prisma.ticketMessage.create({
      data: {
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        authorId: author.id,
        body: text,
        isInternal: body.isInternal === true,
        fromSA: true,
        platformAuthorId: actorId(request)
      }
    });
    await app.prisma.notificationLog.create({ data: { tenantId: ticket.tenantId, channel: 'EMAIL', event: 'support_ticket_reply_from_sa', status: 'QUEUED' } });
    await writeInternalAudit(request, 'support.ticket.reply', 'support_ticket', id, ticket, message, stringValue(body.reason, 'Support ticket reply'));
    reply.status(201).send(message);
  });

  app.get('/api/internal/support/sla', { preHandler: readPre('customer.support.read') }, async (_request, reply) => {
    const open = await app.prisma.supportTicket.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { updatedAt: 'asc' }, take: 100 });
    reply.send({ data: open });
  });

  app.get('/api/internal/support/macros', { preHandler: readPre('customer.support.read') }, async (_request, reply) => {
    const vendor = vendorUnavailable('zendesk');
    if (vendor) return reply.send({ data: [], vendor });
    const data = await vendorJson<unknown>('zendesk', '/macros.json');
    reply.send({ data, vendor: null });
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
    const monthlyRevenueForPlan = (plan?: string | null) => plan === 'ENTERPRISE' ? 500 : plan === 'PRO' ? 79 : plan === 'STARTER' ? 29 : 0;
    const data = scores
      .map((score) => {
        const tenant = tenantById.get(score.tenantId);
        const arr = monthlyRevenueForPlan(tenant?.subscription?.plan ?? tenant?.plan) * 12;
        const churnProbability = Math.max(0, Math.min(1, (60 - score.score) / 60));
        return { ...score, tenant, arr, churnProbability, riskPriority: arr * churnProbability };
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

  app.get('/api/internal/success/health-scoring', { preHandler: readPre('customer.success.read') }, async (_request, reply) => {
    reply.send({
      weights: {
        login: 20,
        shipmentTrend: 25,
        featureBreadth: 15,
        paymentHealth: 15,
        ticketSentimentVolume: 15,
        nps: 10
      }
    });
  });

  app.post('/api/internal/success/health-scoring/run', { preHandler: writePre('customer.success.write') }, async (request, reply) => {
    const job = await scheduledJobsQueue.add(
      'customer.health-scoring',
      { requestedBy: actorId(request), source: 'manual-console' },
      { jobId: `customer.health-scoring.manual.${Date.now()}` }
    );
    await writeInternalAudit(request, 'success.health_score.enqueue', 'job', 'customer.health-scoring', null, { jobId: String(job.id ?? '') }, 'Manual health scoring run queued');
    reply.status(202).send({ queued: true, jobId: job.id, name: job.name });
  });
}

function registerJit(app: FastifyInstance) {
  app.post('/api/internal/jit/requests', { preHandler: writePre('trust.jit.request') }, async (request, reply) => {
    const body = bodyObject(request);
    const permission = assertPermissionValue(body.permission);
    const reason = stringValue(body.reason);
    const durationMinutes = Math.min(240, Math.max(1, numberValue(body.durationMinutes, 60)));
    if (!permission || !reason) return reply.status(400).send({ error: 'permission and reason are required' });
    const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
    const rootRequest = permission === 'trust.iam.root' || body.rootRequest === true;
    const expectedHardwareAssertion = process.env.DEV_HARDWARE_KEY_ASSERTION ?? 'dev-hardware-key';
    const hardwareKeyVerified = !rootRequest || stringValue(body.hardwareKeyAssertion) === expectedHardwareAssertion;
    if (rootRequest && !hardwareKeyVerified) return reply.status(403).send({ error: 'ROOT JIT requires hardware key verification' });
    const jit = await createAndAudit(
      request,
      delegate(app, 'jitAccessRequest'),
      {
        requesterPlatformUserId: actorId(request),
        requesterStaffId: context.staff.id,
        permission,
        reason,
        durationMinutes,
        rootRequest,
        hardwareKeyVerified,
        status: 'PENDING'
      },
      'jit.request.create',
      'jit_request',
      reason
    );
    reply.status(201).send(jit);
  });

  app.get('/api/internal/jit/requests/pending', { preHandler: readPre('trust.jit.approve') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'jitAccessRequest'), { where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } }));
  });

  app.post('/api/internal/jit/requests/:id/approve', { preHandler: writePre('trust.jit.approve') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const jitModel = delegate(app, 'jitAccessRequest');
    const approvalModel = delegate(app, 'jitAccessApproval');
    const before = await jitModel.findUnique({ where: { id } }) as { requesterPlatformUserId?: string; rootRequest?: boolean; durationMinutes?: number; hardwareKeyVerified?: boolean } | null;
    if (!before) return reply.status(404).send({ error: 'JIT request not found' });
    if (before.requesterPlatformUserId === actorId(request)) return reply.status(403).send({ error: 'Self approval is not allowed' });
    if (before.rootRequest && !before.hardwareKeyVerified) return reply.status(403).send({ error: 'ROOT JIT requires hardware key verification' });
    await approvalModel.upsert({
      where: { requestId_approverPlatformUserId: { requestId: id, approverPlatformUserId: actorId(request) } },
      create: { requestId: id, approverPlatformUserId: actorId(request), decision: 'APPROVED', notes: stringValue(body.notes) || null },
      update: { decision: 'APPROVED', notes: stringValue(body.notes) || null }
    });
    const approvals = await approvalModel.count({ where: { requestId: id, decision: 'APPROVED' } });
    const required = before.rootRequest ? 2 : 1;
    const after = approvals >= required
      ? await jitModel.update({ where: { id }, data: { status: 'APPROVED', expiresAt: new Date(Date.now() + (before.durationMinutes ?? 60) * 60 * 1000) } })
      : await jitModel.findUnique({ where: { id } });
    await writeInternalAudit(request, 'jit.request.approve', 'jit_request', id, before, after, stringValue(body.notes, 'JIT approval'));
    reply.send({ approvals, required, request: after });
  });

  app.post('/api/internal/jit/requests/:id/deny', { preHandler: writePre('trust.jit.approve') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const after = await updateAndAudit(request, delegate(app, 'jitAccessRequest'), id, { status: 'DENIED', deniedReason: stringValue(body.reason, 'Denied') }, 'jit.request.deny', 'jit_request', stringValue(body.reason, 'Denied'));
    reply.send(after);
  });

  app.get('/api/internal/jit/sessions/active', { preHandler: readPre('trust.jit.approve') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'jitAccessRequest'), { where: { status: 'APPROVED', revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: 'asc' } }));
  });

  app.get('/api/internal/jit/sessions/my', { preHandler: readPre('trust.jit.request') }, async (request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'jitAccessRequest'), {
      where: { requesterPlatformUserId: actorId(request), status: 'APPROVED', revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'asc' }
    }));
  });

  app.post('/api/internal/jit/sessions/:id/revoke', { preHandler: writePre('trust.jit.approve') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const after = await updateAndAudit(request, delegate(app, 'jitAccessRequest'), id, { revokedAt: new Date(), status: 'REVOKED' }, 'jit.session.revoke', 'jit_request', stringValue(bodyObject(request).reason, 'JIT revoked'));
    reply.send(after);
  });
}

function registerCompliance(app: FastifyInstance) {
  app.post('/api/internal/compliance/dsar', { preHandler: writePre('trust.compliance.dsar.write') }, async (request, reply) => {
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    const requesterEmail = stringValue(body.requesterEmail);
    if (!tenantId || !requesterEmail) return reply.status(400).send({ error: 'tenantId and requesterEmail are required' });
    const dsar = await createAndAudit(
      request,
      delegate(app, 'dSARRequest'),
      { tenantId, requesterEmail, requestType: stringValue(body.requestType, 'ACCESS'), status: 'RECEIVED', notes: stringValue(body.notes), dueAt: inDays(30) },
      'compliance.dsar.create',
      'dsar_request',
      stringValue(body.reason, 'DSAR intake')
    );
    reply.status(201).send(dsar);
  });

  app.get('/api/internal/compliance/dsar', { preHandler: readPre('trust.compliance.dsar.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'dSARRequest'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.patch('/api/internal/compliance/dsar/:id', { preHandler: writePre('trust.compliance.dsar.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const next = stringValue(body.status);
    if (!DSAR_STATES.includes(next)) return reply.status(400).send({ error: 'Invalid DSAR state' });
    const model = delegate(app, 'dSARRequest');
    const before = await model.findUnique({ where: { id } }) as { status?: string; tenantId?: string; requestType?: string } | null;
    if (!before) return reply.status(404).send({ error: 'DSAR request not found' });
    if (before.requestType === 'ERASURE' && ['DELIVERED', 'CLOSED'].includes(next)) {
      const allowed = await requireNoActiveLegalHold(app, before.tenantId, reply);
      if (!allowed) return;
    }
    const after = await model.update({ where: { id }, data: { status: next, notes: stringValue(body.notes) || undefined, closedAt: next === 'CLOSED' ? new Date() : undefined } });
    await delegate(app, 'dSARTransition').create({ data: { dsarId: id, fromStatus: before.status ?? null, toStatus: next, actorId: actorId(request), notes: stringValue(body.notes) || null } });
    await writeInternalAudit(request, 'compliance.dsar.transition', 'dsar_request', id, before, after, stringValue(body.notes, 'DSAR transition'));
    reply.send(after);
  });

  app.post('/api/internal/compliance/dsar/:id/gather', { preHandler: writePre('trust.compliance.dsar.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const dsar = await delegate(app, 'dSARRequest').findUnique({ where: { id } }) as { tenantId?: string } | null;
    if (!dsar) return reply.status(404).send({ error: 'DSAR request not found' });
    const exportRow = await createAndAudit(request, delegate(app, 'complianceExport'), { tenantId: dsar.tenantId, dsarId: id, exportType: 'DSAR_BUNDLE', status: 'QUEUED', requestedBy: actorId(request) }, 'compliance.dsar.gather', 'dsar_request', 'DSAR gather job queued');
    reply.status(202).send(exportRow);
  });

  app.post('/api/internal/compliance/dsar/:id/deliver', { preHandler: writePre('trust.compliance.dsar.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const dsar = await delegate(app, 'dSARRequest').findUnique({ where: { id } }) as { tenantId?: string; requestType?: string } | null;
    if (!dsar) return reply.status(404).send({ error: 'DSAR request not found' });
    if (dsar.requestType === 'ERASURE') {
      const allowed = await requireNoActiveLegalHold(app, dsar.tenantId, reply);
      if (!allowed) return;
    }
    const signedUrl = `https://signed.example.fauward.internal/dsar/${id}?expires=${encodeURIComponent(inDays(30).toISOString())}`;
    const after = await updateAndAudit(request, delegate(app, 'dSARRequest'), id, { exportUrl: signedUrl, expiresAt: inDays(30), status: 'DELIVERED' }, 'compliance.dsar.deliver', 'dsar_request', stringValue(bodyObject(request).reason, 'DSAR delivered'));
    reply.send(after);
  });

  app.get('/api/internal/compliance/legal-hold', { preHandler: readPre('trust.compliance.legal-hold.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'legalHold'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/internal/compliance/legal-hold', { preHandler: writePre('trust.compliance.legal-hold.write') }, async (request, reply) => {
    const body = bodyObject(request);
    const hold = await createAndAudit(request, delegate(app, 'legalHold'), { tenantId: stringValue(body.tenantId) || null, scope: body.scope ?? {}, reason: stringValue(body.reason, 'Legal hold'), createdBy: actorId(request) }, 'compliance.legal_hold.create', 'legal_hold', stringValue(body.reason, 'Legal hold'));
    reply.status(201).send(hold);
  });
}

function registerSafety(app: FastifyInstance) {
  app.get('/api/internal/safety/fraud', { preHandler: readPre('trust.safety.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'fraudSignal'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/internal/safety/fraud', { preHandler: writePre('trust.safety.suspend') }, async (request, reply) => {
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const signal = await createAndAudit(request, delegate(app, 'fraudSignal'), { tenantId, source: stringValue(body.source, 'manual'), signalType: stringValue(body.signalType, 'manual_flag'), severity: stringValue(body.severity, 'MEDIUM'), payload: body.payload ?? body }, 'safety.fraud.flag', 'fraud_signal', stringValue(body.reason, 'Fraud flag'));
    reply.status(201).send(signal);
  });

  app.post('/api/internal/safety/fraud/:id/decision', { preHandler: writePre('trust.safety.suspend') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const decision = stringValue(body.decision);
    const model = delegate(app, 'fraudSignal');
    const signal = await model.findUnique({ where: { id } }) as { tenantId?: string } | null;
    if (!signal) return reply.status(404).send({ error: 'Fraud signal not found' });
    const updated = await updateAndAudit(request, model, id, { status: 'CLOSED', reviewedBy: actorId(request), decision }, 'safety.fraud.decision', 'fraud_signal', stringValue(body.reason, decision));
    if (decision === 'suspend' && signal.tenantId) {
      const tenantBefore = await app.prisma.tenant.findUnique({ where: { id: signal.tenantId } });
      const tenantAfter = await app.prisma.tenant.update({ where: { id: signal.tenantId }, data: { status: 'SUSPENDED' } });
      await delegate(app, 'suspensionRecord').create({ data: { tenantId: signal.tenantId, sourceSignalId: id, suspendedBy: actorId(request), reason: stringValue(body.reason, 'Trust and safety suspension') } });
      await app.prisma.notificationLog.create({
        data: {
          tenantId: signal.tenantId,
          channel: 'EMAIL',
          event: 'trust_safety_tenant_suspended',
          status: 'QUEUED'
        }
      });
      await writeInternalAudit(request, 'safety.tenant.suspend', 'tenant', signal.tenantId, tenantBefore, tenantAfter, stringValue(body.reason, 'Trust and safety suspension'));
    }
    reply.send(updated);
  });

  app.get('/api/internal/safety/suspensions', { preHandler: readPre('trust.safety.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'suspensionRecord'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/safety/appeals', { preHandler: readPre('trust.safety.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'tenantAppeal'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/safety/appeals/:id', { preHandler: readPre('trust.safety.read') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const appeal = await delegate(app, 'tenantAppeal').findUnique({ where: { id } });
    if (!appeal) return reply.status(404).send({ error: 'Appeal not found' });
    reply.send(appeal);
  });

  app.patch('/api/internal/safety/appeals/:id', { preHandler: writePre('trust.safety.suspend') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const status = stringValue(body.status).toUpperCase();
    if (!['APPROVED', 'REJECTED', 'PENDING', 'OPEN'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid appeal status' });
    }
    const model = delegate(app, 'tenantAppeal');
    const before = await model.findUnique({ where: { id } }) as { tenantId?: string; status?: string } | null;
    if (!before) return reply.status(404).send({ error: 'Appeal not found' });

    const after = await model.update({
      where: { id },
      data: {
        status,
        resolvedBy: ['APPROVED', 'REJECTED'].includes(status) ? actorId(request) : undefined,
        resolution: status,
        reviewNote: stringValue(body.reviewNote, stringValue(body.reason)) || undefined
      }
    });
    if (status === 'APPROVED' && before.tenantId) {
      const tenantBefore = await app.prisma.tenant.findUnique({ where: { id: before.tenantId } });
      const tenantAfter = await app.prisma.tenant.update({
        where: { id: before.tenantId },
        data: { status: 'ACTIVE', suspensionReason: null, suspendedAt: null }
      });
      await delegate(app, 'suspensionRecord').update({
        where: { id: stringValue(body.suspensionId, '') },
        data: { status: 'LIFTED', liftedBy: actorId(request), liftedAt: new Date() }
      }).catch(() => null);
      await writeInternalAudit(request, 'safety.appeal.approve_unsuspend', 'tenant', before.tenantId, tenantBefore, tenantAfter, stringValue(body.reason, 'Appeal approved'));
    }
    await writeInternalAudit(request, 'safety.appeal.review', 'tenant_appeal', id, before, after, stringValue(body.reason, 'Appeal reviewed'));
    reply.send(after);
  });

  app.get('/api/internal/safety/aup', { preHandler: readPre('trust.safety.read') }, async (_request, reply) => {
    reply.send({ data: [] });
  });

  app.get('/api/internal/safety/rules', { preHandler: readPre('trust.safety.read') }, async (_request, reply) => {
    reply.send({ data: [], phase: 4, enabled: false });
  });
}

function registerFlags(app: FastifyInstance) {
  app.get('/api/internal/flags', { preHandler: readPre('platform.flags.read') }, async (_request, reply) => {
    const vendor = vendorUnavailable('launchdarkly');
    if (vendor) return reply.send({ data: [], vendor });
    const data = await vendorJson<unknown>('launchdarkly', '/flags/default');
    reply.send({ data, vendor: null });
  });

  app.get('/api/internal/flags/:key', { preHandler: readPre('platform.flags.read') }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const audits = await delegate(app, 'featureFlagOverrideAudit').findMany({ where: { flagKey: key }, orderBy: { createdAt: 'desc' }, take: 100 });
    reply.send({ key, audits, vendor: vendorUnavailable('launchdarkly') });
  });

  app.post('/api/internal/flags/:key/overrides', { preHandler: writePre('platform.flags.write') }, async (request, reply) => {
    const vendor = vendorUnavailable('launchdarkly');
    const { key } = request.params as { key: string };
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    if (vendor) return reply.status(503).send({ error: 'LAUNCHDARKLY_NOT_CONFIGURED', vendor });
    const vendorResult = await vendorJson<unknown>('launchdarkly', `/flags/default/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        environmentKey: 'production',
        instructions: [{ kind: 'turnFlagOn' }],
        comment: stringValue(body.reason, `Tenant override for ${tenantId}`),
        tenantId,
        value: body.value ?? false
      })
    });
    const audit = await createAndAudit(request, delegate(app, 'featureFlagOverrideAudit'), { flagKey: key, tenantId, value: body.value ?? false, actorId: actorId(request), vendorRef: 'launchdarkly' }, 'flags.override.set', 'feature_flag', stringValue(body.reason, 'Feature flag override'));
    reply.status(201).send({ audit, vendor: vendorResult, vendorUnavailable: vendor });
  });

  app.get('/api/internal/flags/:key/audit', { preHandler: readPre('platform.flags.read') }, async (request, reply) => {
    const { key } = request.params as { key: string };
    reply.send(await listWithMeta(delegate(app, 'featureFlagOverrideAudit'), { where: { flagKey: key }, orderBy: { createdAt: 'desc' } }));
  });

  app.get('/api/internal/releases', { preHandler: readPre('platform.flags.read') }, async (_request, reply) => {
    reply.send({ data: [], vendor: vendorUnavailable('github') });
  });
}

function registerSecrets(app: FastifyInstance) {
  app.get('/api/internal/secrets', { preHandler: readPre('trust.secrets.read') }, async (_request, reply) => {
    reply.send({ ...(await listWithMeta(delegate(app, 'secretCredential'), { orderBy: { expiresAt: 'asc' } })), vendor: vendorUnavailable('doppler') });
  });

  app.get('/api/internal/secrets/expiring', { preHandler: readPre('trust.secrets.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'secretCredential'), { where: { expiresAt: { lte: inDays(30) } }, orderBy: { expiresAt: 'asc' } }));
  });

  app.get('/api/internal/secrets/audit', { preHandler: readPre('trust.secrets.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'secretAccessLog'), { orderBy: { accessedAt: 'desc' }, take: 100 }));
  });

  app.patch('/api/internal/secrets/:id', { preHandler: writePre('trust.secrets.write') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const after = await updateAndAudit(request, delegate(app, 'secretCredential'), id, { expiresAt: body.expiresAt ? dateValue(body.expiresAt) : undefined, rotationNotes: body.rotationNotes }, 'secrets.metadata.update', 'secret_credential', stringValue(body.reason, 'Secret metadata update'));
    reply.send(after);
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
    const vendor = vendorUnavailable('persona');
    if (vendor) return reply.status(503).send({ error: 'PERSONA_NOT_CONFIGURED', vendor });
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const persona = await vendorJson<Record<string, unknown>>('persona', '/inquiries', {
      method: 'POST',
      body: JSON.stringify({ data: { attributes: { 'reference-id': tenantId } } })
    });
    const data = nestedRecord(persona.data);
    const review = await createAndAudit(
      request,
      delegate(app, 'kYCReview'),
      { tenantId, inquiryId: stringValue(data.id) || null, status: 'PENDING', payload: persona },
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
    const vendor = vendorUnavailable('complyadvantage');
    if (vendor) return reply.status(503).send({ error: 'COMPLYADVANTAGE_NOT_CONFIGURED', vendor });
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const result = await vendorJson<Record<string, unknown>>('complyadvantage', '/searches', {
      method: 'POST',
      body: JSON.stringify({ search_term: stringValue(body.searchTerm, tenantId), client_ref: tenantId })
    });
    const matchType = stringValue(body.matchType, stringValue(nestedRecord(result).matchType));
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

function registerIntegrations(app: FastifyInstance) {
  app.get('/api/internal/integrations', { preHandler: readPre('platform.integrations.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'integrationProviderStatus'), { orderBy: { provider: 'asc' } }));
  });

  app.get('/api/internal/integrations/:provider', { preHandler: readPre('platform.integrations.read') }, async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const status = await delegate(app, 'integrationProviderStatus').findUnique({ where: { provider } });
    reply.send({ provider, status });
  });

  app.get('/api/internal/integrations/credentials', { preHandler: readPre('platform.integrations.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'secretCredential'), { orderBy: { expiresAt: 'asc' } }));
  });

  app.get('/api/internal/integrations/webhooks', { preHandler: readPre('platform.integrations.read') }, async (_request, reply) => {
    const data = await app.prisma.webhookDelivery.findMany({ include: { endpoint: true, tenant: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    reply.send({ data });
  });
}

function registerTax(app: FastifyInstance) {
  app.get('/api/internal/tax', { preHandler: readPre('revenue.tax.read') }, async (_request, reply) => {
    const [registrations, returns] = await Promise.all([
      delegate(app, 'taxRegistration').findMany({ orderBy: { region: 'asc' } }),
      delegate(app, 'taxReturn').findMany({ orderBy: { periodStart: 'desc' }, take: 20 })
    ]);
    reply.send({ registrations, returns, vendors: { stripeTax: Boolean(process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY), anrok: !vendorUnavailable('anrok') } });
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

function registerSubscriptions(app: FastifyInstance) {
  app.get('/api/internal/subscriptions', { preHandler: readPre('revenue.subscriptions.read') }, async (_request, reply) => {
    const data = await app.prisma.subscription.findMany({ include: { tenant: true }, orderBy: { updatedAt: 'desc' }, take: 100 });
    reply.send({ data });
  });

  app.get('/api/internal/subscriptions/contracts', { preHandler: readPre('revenue.subscriptions.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'customContract'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/internal/subscriptions/contracts', { preHandler: writePre('revenue.subscriptions.write') }, async (request, reply) => {
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const contract = await createAndAudit(request, delegate(app, 'customContract'), { tenantId, msaUrl: stringValue(body.msaUrl) || null, termStart: dateValue(body.termStart), termEnd: dateValue(body.termEnd, inDays(365)), terms: body.terms ?? {}, status: 'DRAFT' }, 'subscriptions.contract.create', 'custom_contract', stringValue(body.reason, 'Custom contract'));
    reply.status(201).send(contract);
  });

  app.get('/api/internal/subscriptions/overrides', { preHandler: readPre('revenue.subscriptions.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'pricingOverride'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/internal/subscriptions/overrides', { preHandler: writePre('revenue.subscriptions.override') }, async (request, reply) => {
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });

    const discountPercent = numberValue(body.discountPercent);
    const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
    if (discountPercent > 25 && !context.roles.includes('CFO') && !context.roles.includes('ROOT')) {
      return reply.status(403).send({ error: 'CFO approval required', requiredRole: 'CFO' });
    }
    if (discountPercent >= 10 && !context.roles.some((role) => ['SALES_MANAGER', 'SALES_DIRECTOR', 'CFO', 'ROOT'].includes(role))) {
      return reply.status(403).send({ error: 'Sales manager approval required', requiredRole: 'SALES_MANAGER' });
    }

    const override = await createAndAudit(
      request,
      delegate(app, 'pricingOverride'),
      {
        tenantId,
        contractId: stringValue(body.contractId) || null,
        ruleType: stringValue(body.ruleType, 'discount_percent'),
        ruleValue: body.ruleValue ?? { discountPercent },
        discountPercent,
        validFrom: dateValue(body.validFrom),
        validTo: body.validTo ? dateValue(body.validTo) : null,
        status: 'APPROVED'
      },
      'subscriptions.override.create',
      'pricing_override',
      stringValue(body.reason, 'Pricing override')
    );
    reply.status(201).send(override);
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
    const vendor = vendorUnavailable('docusign');
    if (vendor) return reply.status(503).send({ error: 'DOCUSIGN_NOT_CONFIGURED', vendor });
    const { id } = request.params as RequestWithId;
    const envelope = await vendorJson<Record<string, unknown>>('docusign', `/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID ?? 'default'}/envelopes`, {
      method: 'POST',
      body: JSON.stringify({ status: 'sent', emailSubject: `Fauward quote ${id}` })
    });
    const envelopeId = stringValue(envelope.envelopeId, `env_${Date.now()}`);
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
    reply.send({ ...(await listWithMeta(delegate(app, 'salesDeal'), { orderBy: { closeDate: 'asc' }, take: 100 })), vendor: vendorUnavailable('hubspot') });
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
    reply.send({ ...(await listWithMeta(delegate(app, 'marketingAttribution'), { orderBy: { periodStart: 'desc' }, take: 100 })), vendor: vendorUnavailable('posthog') });
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

  app.get('/api/internal/pricing/experiments', { preHandler: readPre('gtm.pricing.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'pricingExperiment'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/pricing/plans', { preHandler: readPre('gtm.pricing.read') }, async (_request, reply) => {
    reply.send({ data: ['STARTER', 'PRO', 'ENTERPRISE', 'TRIALING'] });
  });

  app.get('/api/internal/partners', { preHandler: readPre('gtm.partners.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'partner'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/partners/applications', { preHandler: readPre('gtm.partners.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'partnerApplication'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/partners/deal-registration', { preHandler: readPre('gtm.partners.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'partnerDealRegistration'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/commissions', { preHandler: readPre('revenue.commissions.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'commissionLedger'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.get('/api/internal/commissions/payouts', { preHandler: readPre('revenue.commissions.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'commissionPayout'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });

  app.post('/api/internal/commissions/payouts/:id/approve', { preHandler: writePre('revenue.commissions.payout') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const payout = await delegate(app, 'commissionPayout').findUnique({ where: { id } }) as { amount?: number | string; approvedByFinance?: string | null; approvedByCfo?: string | null } | null;
    if (!payout) return reply.status(404).send({ error: 'Payout not found' });
    const amount = Number(payout.amount ?? 0);
    const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
    const needsCfo = amount > 5000;
    const isCfo = context.roles.includes('CFO') || context.roles.includes('ROOT');
    if (needsCfo && !context.roles.includes('CFO') && !context.roles.includes('ROOT')) {
      const after = await updateAndAudit(request, delegate(app, 'commissionPayout'), id, { approvedByFinance: actorId(request), status: 'CFO_REQUIRED' }, 'commissions.payout.finance_approve', 'commission_payout', stringValue(bodyObject(request).reason, 'Finance approval'));
      return reply.send(after);
    }
    if (needsCfo && isCfo && !payout.approvedByFinance) {
      return reply.status(403).send({ error: 'FINANCE_ADMIN approval required before CFO approval', requiredRole: 'FINANCE_ADMIN' });
    }
    if (needsCfo && payout.approvedByFinance === actorId(request)) {
      return reply.status(403).send({ error: 'Two-person approval required for payouts over GBP 5000' });
    }
    const after = await updateAndAudit(request, delegate(app, 'commissionPayout'), id, { approvedByCfo: needsCfo ? actorId(request) : payout.approvedByCfo ?? null, approvedByFinance: payout.approvedByFinance ?? actorId(request), status: 'APPROVED' }, 'commissions.payout.approve', 'commission_payout', stringValue(bodyObject(request).reason, 'Payout approved'));
    reply.send(after);
  });

  app.get('/api/internal/commissions/disputes', { preHandler: readPre('revenue.commissions.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'commissionDispute'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });
}
