import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PERMISSIONS, type Permission } from '@fauward/internal-rbac';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireInternalPermission } from '../../middleware/require-internal-permission.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { staffPermissionContextForPlatformUser } from '../../services/staff-iam.service.js';
import { constantTimeEquals, vendorJson, vendorUnavailable } from '../../services/internal-vendors.service.js';
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

function assertPermissionValue(value: unknown): Permission | null {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value) ? (value as Permission) : null;
}

async function requireNoActiveLegalHold(app: FastifyInstance, tenantId: string | undefined | null, reply: FastifyReply) {
  if (!tenantId) return true;
  const hold = await delegate(app, 'legalHold').findFirst({
    where: {
      status: 'ACTIVE',
      OR: [{ tenantId }, { tenantId: null }]
    }
  });
  if (hold) {
    reply.status(409).send({ error: 'LEGAL_HOLD_ACTIVE', tenantId });
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
    await writeInternalAudit(request, 'incident.impact.annotate', 'incident', id, null, impact, stringValue(body.reason, 'Incident impact annotation'));
    reply.send(impact);
  });

  app.post('/api/internal/incidents/webhooks/pagerduty', async (request, reply) => {
    const expected = process.env.PAGERDUTY_WEBHOOK_SECRET;
    const signature = typeof request.headers['x-fauward-pagerduty-secret'] === 'string' ? request.headers['x-fauward-pagerduty-secret'] : undefined;
    if (expected && !constantTimeEquals(expected, signature)) return reply.status(401).send({ error: 'Invalid webhook signature' });
    const body = bodyObject(request);
    const event = (body.event && typeof body.event === 'object' ? body.event : body) as Record<string, unknown>;
    const incident = (event.incident && typeof event.incident === 'object' ? event.incident : event) as Record<string, unknown>;
    const vendorId = stringValue(incident.id, `pd_${Date.now()}`);
    const record = await delegate(app, 'incidentRecord').upsert({
      where: { vendorId },
      create: {
        vendor: 'pagerduty',
        vendorId,
        title: stringValue(incident.title, stringValue(incident.summary, 'PagerDuty incident')),
        status: stringValue(incident.status, 'triggered'),
        severity: stringValue(incident.urgency, 'medium'),
        payload: body
      },
      update: { status: stringValue(incident.status, 'triggered'), payload: body }
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
    const data = await delegate(app, 'supportVendorTicket').findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 100
    });
    reply.send({ data, vendor: vendorUnavailable('zendesk') });
  });

  app.post('/api/internal/support/tickets', { preHandler: writePre('customer.support.write') }, async (request, reply) => {
    const vendor = vendorUnavailable('zendesk');
    if (vendor) return reply.status(503).send({ error: 'ZENDESK_NOT_CONFIGURED', vendor });
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const created = await vendorJson<{ ticket: { id: number; url?: string; status?: string } }>('zendesk', '/tickets.json', {
      method: 'POST',
      body: JSON.stringify({ ticket: { subject: body.subject, comment: { body: body.message } } })
    });
    const ticket = await createAndAudit(
      request,
      delegate(app, 'supportVendorTicket'),
      {
        tenantId,
        vendor: 'zendesk',
        vendorId: String(created.ticket.id),
        subject: stringValue(body.subject, 'Tenant support request'),
        status: created.ticket.status ?? 'new',
        url: created.ticket.url,
        latestMessage: stringValue(body.message)
      },
      'support.ticket.create',
      'support_ticket',
      stringValue(body.reason, 'Created support ticket')
    );
    reply.status(201).send(ticket);
  });

  app.get('/api/internal/support/sla', { preHandler: readPre('customer.support.read') }, async (_request, reply) => {
    const open = await delegate(app, 'supportVendorTicket').findMany({ where: { status: { in: ['new', 'open', 'pending'] } }, orderBy: { updatedAt: 'asc' }, take: 100 });
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
    const data = await delegate(app, 'tenantHealthScore').findMany({ where: { score: { lt: 45 } }, orderBy: [{ score: 'asc' }, { computedAt: 'desc' }], take: 100 });
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
    const activeTenants = await app.prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'TRIALING'] } }, select: { id: true } });
    const created: unknown[] = [];
    for (const tenant of activeTenants) {
      const [shipments, failedPayments, tickets] = await Promise.all([
        app.prisma.shipment.count({ where: { tenantId: tenant.id } }),
        app.prisma.payment.count({ where: { tenantId: tenant.id, status: 'FAILED' } }),
        delegate(app, 'supportVendorTicket').count({ where: { tenantId: tenant.id } })
      ]);
      const score = Math.max(0, Math.min(100, 50 + Math.min(25, shipments) - failedPayments * 10 - Math.min(15, tickets)));
      created.push(await delegate(app, 'tenantHealthScore').create({ data: { tenantId: tenant.id, score, trend: 'flat', factors: { shipments, failedPayments, tickets } } }));
    }
    await writeInternalAudit(request, 'success.health_score.run', 'job', 'health-scoring', null, { count: created.length }, 'Manual health scoring run');
    reply.send({ count: created.length, data: created });
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
    const before = await model.findUnique({ where: { id } }) as { status?: string } | null;
    if (!before) return reply.status(404).send({ error: 'DSAR request not found' });
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
    const signedUrl = `s3://fauward-dsar/${id}?expires=${encodeURIComponent(inDays(30).toISOString())}`;
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

  app.post('/api/internal/safety/fraud', { preHandler: writePre('trust.safety.read') }, async (request, reply) => {
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
    if (vendor) return reply.status(503).send({ error: 'LAUNCHDARKLY_NOT_CONFIGURED', vendor });
    const { key } = request.params as { key: string };
    const body = bodyObject(request);
    const tenantId = stringValue(body.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId is required' });
    const audit = await createAndAudit(request, delegate(app, 'featureFlagOverrideAudit'), { flagKey: key, tenantId, value: body.value ?? false, actorId: actorId(request) }, 'flags.override.set', 'feature_flag', stringValue(body.reason, 'Feature flag override'));
    reply.status(201).send(audit);
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

  app.patch('/api/internal/secrets/:id', { preHandler: writePre('trust.secrets.read') }, async (request, reply) => {
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
    const after = await app.prisma.staffSession.update({ where: { id }, data: { revokedAt: new Date() } });
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
    const review = await createAndAudit(request, delegate(app, 'kYCReview'), { tenantId, status: 'PENDING', payload: body }, 'kyc.inquiry.create', 'kyc_review', stringValue(body.reason, 'KYC inquiry'));
    reply.status(201).send(review);
  });

  app.post('/api/internal/kyc/inquiries/:id/decision', { preHandler: writePre('trust.kyc.approve') }, async (request, reply) => {
    const { id } = request.params as RequestWithId;
    const body = bodyObject(request);
    const decision = stringValue(body.decision);
    const before = await delegate(app, 'kYCReview').findUnique({ where: { id } }) as { tenantId?: string } | null;
    if (!before) return reply.status(404).send({ error: 'KYC review not found' });
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
    const screening = await createAndAudit(request, delegate(app, 'sanctionsScreening'), { tenantId, status: 'PENDING', payload: body }, 'kyc.sanctions.screen', 'sanctions_screening', stringValue(body.reason, 'Manual sanctions screen'));
    reply.status(201).send(screening);
  });

  app.post('/api/internal/kyc/webhooks/persona', async (_request, reply) => reply.send({ received: true }));
  app.post('/api/internal/kyc/webhooks/complyadvantage', async (_request, reply) => reply.send({ received: true }));
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
    const after = await updateAndAudit(request, delegate(app, 'salesQuote'), id, { status: 'SENT_FOR_SIGNATURE', docusignEnvelopeId: `env_${Date.now()}` }, 'contracts.quote.send_for_signature', 'sales_quote', stringValue(bodyObject(request).reason, 'Send to DocuSign'));
    reply.send(after);
  });

  app.post('/api/internal/contracts/webhooks/docusign', async (_request, reply) => reply.send({ received: true }));

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
    if (days > 30) return reply.status(403).send({ error: 'Trial extensions over 30 days are not allowed' });
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
    const payout = await delegate(app, 'commissionPayout').findUnique({ where: { id } }) as { amount?: number | string; approvedByFinance?: string | null } | null;
    if (!payout) return reply.status(404).send({ error: 'Payout not found' });
    const amount = Number(payout.amount ?? 0);
    const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
    const needsCfo = amount > 5000;
    if (needsCfo && !context.roles.includes('CFO') && !context.roles.includes('ROOT')) {
      const after = await updateAndAudit(request, delegate(app, 'commissionPayout'), id, { approvedByFinance: actorId(request), status: 'CFO_REQUIRED' }, 'commissions.payout.finance_approve', 'commission_payout', stringValue(bodyObject(request).reason, 'Finance approval'));
      return reply.send(after);
    }
    const after = await updateAndAudit(request, delegate(app, 'commissionPayout'), id, { approvedByCfo: needsCfo ? actorId(request) : undefined, approvedByFinance: payout.approvedByFinance ?? actorId(request), status: 'APPROVED' }, 'commissions.payout.approve', 'commission_payout', stringValue(bodyObject(request).reason, 'Payout approved'));
    reply.send(after);
  });

  app.get('/api/internal/commissions/disputes', { preHandler: readPre('revenue.commissions.read') }, async (_request, reply) => {
    reply.send(await listWithMeta(delegate(app, 'commissionDispute'), { orderBy: { createdAt: 'desc' }, take: 100 }));
  });
}
