import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { InvoiceStatus, type LedgerKind, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { writeAudit } from '@fauward/internal-audit';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { consoleUserHas, requireConsolePermission } from '../../middleware/require-console-permission.js';
import { dangerous } from '../../middleware/dangerous.js';
import { config } from '../../config/index.js';
import { platformAuditClient } from '../../services/platform-audit-client.js';
import { RefundError, decideRefund, requestRefund } from '../../services/refund.service.js';
import { recordAndPublishActivity, staffActor } from '../../services/platform-activity.service.js';
import {
  BillingError,
  PLATFORM,
  createInvoiceBody,
  createPlatformCreditNote,
  createPlatformInvoice,
  creditNoteBody,
  invoiceBalance,
  manualPaymentBody,
  recordManualPayment,
  voidPlatformInvoice,
  type BillingActor
} from '../../services/platform-billing.service.js';
import { stripeService } from '../payments/stripe.service.js';

// revenue.billing (WP-1.5): the console bills tenants on the PLATFORM ledger. Reads default to PLATFORM; `kind=
// TENANT_CUSTOMER` shows a tenant's own customer ledger read-only for support investigations (D4).

const readPre = [authenticatePlatformSession, requireConsolePermission('revenue.invoices.read')];
const writePre = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('revenue.invoices.write')];

const kindParam = z.enum(['PLATFORM', 'TENANT_CUSTOMER']).default('PLATFORM');
const dateParam = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'must be a date');
const listQuery = z.object({
  kind: kindParam,
  tenantId: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional()
});

function requestIdempotencyKey(request: FastifyRequest) {
  const header = request.headers['idempotency-key'] ?? request.headers['x-idempotency-key'];
  return typeof header === 'string' && header.trim().length > 0 ? header.trim() : null;
}

/** Client-supplied key (Idempotency-Key header or body) wins; otherwise a key derived from the request content. */
function refundIdempotencyKey(request: FastifyRequest, paymentId: string, amount: unknown, reason: string, bodyKey?: string) {
  const supplied = bodyKey?.trim() || requestIdempotencyKey(request);
  if (supplied) return `refund:${paymentId}:${supplied}`;
  const reasonHash = createHash('sha256').update(reason).digest('hex').slice(0, 24);
  return `refund:${paymentId}:${String(amount)}:${reasonHash}`;
}

function sendRefundError(reply: FastifyReply, error: unknown) {
  if (error instanceof RefundError) return reply.status(error.status).send({ error: error.code, message: error.message, ...error.extra });
  throw error;
}

function sendBillingError(reply: FastifyReply, error: unknown) {
  if (error instanceof BillingError) return reply.status(error.statusCode).send({ error: error.code, message: error.message, ...error.extra });
  throw error;
}

function billingActor(request: FastifyRequest): BillingActor {
  const user = request.platform!.user;
  return { type: 'STAFF', platformUserId: user.id, email: user.email, label: user.name ?? user.email, ipAddress: request.ip, userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null };
}

async function auditBilling(request: FastifyRequest, action: string, targetType: string, targetId: string, before: unknown, after: unknown, reason?: string | null) {
  await writeAudit(platformAuditClient(request.server.prisma), {
    actor_id: request.platform!.user.id,
    actor_email: request.platform!.user.email,
    actor_role: request.platform!.user.role,
    action,
    target_type: targetType,
    target_id: targetId,
    before,
    after,
    reason: reason ?? null,
    ip_address: request.ip,
    session_id: request.platform!.session.id,
    jit_session_id: request.jitSessionId ?? null,
    user_agent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null
  });
}

function parseList(request: FastifyRequest, reply: FastifyReply) {
  const parsed = listQuery.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    return null;
  }
  return parsed.data;
}

function createdRange(query: { from?: string; to?: string }) {
  return query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {};
}

function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null };
}

const tenantSelect = { select: { id: true, name: true, slug: true } } as const;

type RefundActivityRow = { id: string; tenantId: string; amount: Prisma.Decimal | string | number; currency: string | null; status: string };

/** One PlatformActivity row per refund mutation (architecture §12.4). */
async function refundActivity(app: FastifyInstance, request: FastifyRequest, type: string, refund: RefundActivityRow, reason: string) {
  await recordAndPublishActivity(
    { prisma: app.prisma, redis: app.redis, log: app.log },
    {
      service: 'revenue.billing',
      type,
      tenantId: refund.tenantId,
      ...staffActor(request),
      subjectType: 'refund',
      subjectId: refund.id,
      summary: `Refund ${String(refund.amount)} ${refund.currency ?? ''} ${refund.status.toLowerCase().replaceAll('_', ' ')} — ${reason}`.replace(/\s+/g, ' '),
      severity: type === 'refund.requested' ? 'ATTENTION' : 'INFO',
      consoleLink: '/revenue/billing/refunds',
      dedupeKey: `${type}:${refund.id}`
    }
  );
}

export async function registerInternalBillingRoutes(app: FastifyInstance) {
  app.get('/api/internal/billing/invoices', { preHandler: readPre }, async (request, reply) => {
    const query = parseList(request, reply);
    if (!query) return;
    const status = query.status && (Object.values(InvoiceStatus) as string[]).includes(query.status) ? (query.status as InvoiceStatus) : undefined;
    if (query.status && !status) return reply.status(400).send({ error: 'INVALID_QUERY', message: `status must be one of ${Object.values(InvoiceStatus).join(', ')}` });
    const where: Prisma.InvoiceWhereInput = { ...(query.tenantId ? { tenantId: query.tenantId } : {}), ...(status ? { status } : {}), ...createdRange(query) };
    const rows = await app.prisma.invoice.findMany({
      where: { ...where, kind: query.kind },
      include: { tenant: tenantSelect, payments: { where: { kind: query.kind } }, creditNotes: { where: { kind: query.kind } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const result = page(rows, query.limit);
    return reply.send({
      kind: query.kind,
      readOnly: query.kind !== PLATFORM,
      nextCursor: result.nextCursor,
      data: result.data.map(({ payments, creditNotes, ...invoice }) => {
        const balance = invoiceBalance({ total: invoice.total, payments, creditNotes });
        return { ...invoice, paid: balance.paid.toFixed(2), credited: balance.credited.toFixed(2), outstanding: balance.outstanding.toFixed(2) };
      })
    });
  });

  app.get('/api/internal/billing/invoices/:id', { preHandler: readPre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsedKind = kindParam.safeParse((request.query as { kind?: string }).kind);
    const kind: LedgerKind = parsedKind.success ? parsedKind.data : PLATFORM;
    const invoice = await app.prisma.invoice.findUnique({
      where: { id, kind },
      include: {
        tenant: tenantSelect,
        payments: { where: { kind }, include: { refunds: { where: { kind }, include: { approvals: true } } }, orderBy: { createdAt: 'asc' } },
        creditNotes: { where: { kind }, orderBy: { createdAt: 'asc' } }
      }
    });
    if (!invoice) return reply.status(404).send({ error: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    const balance = invoiceBalance(invoice);
    return reply.send({ ...invoice, readOnly: kind !== PLATFORM, paid: balance.paid.toFixed(2), credited: balance.credited.toFixed(2), outstanding: balance.outstanding.toFixed(2) });
  });

  app.post('/api/internal/billing/invoices', { preHandler: writePre }, async (request, reply) => {
    const parsed = createInvoiceBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: `${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}` });
    try {
      const invoice = await createPlatformInvoice(app, parsed.data, billingActor(request));
      await auditBilling(request, 'invoice.create', 'invoice', invoice.id, null, invoice, parsed.data.reason ?? null);
      return reply.status(201).send(invoice);
    } catch (error) {
      return sendBillingError(reply, error);
    }
  });

  app.post('/api/internal/billing/invoices/:id/void', { preHandler: dangerous('revenue.invoices.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const reason = (request.body as { reason: string }).reason.trim();
    try {
      const invoice = await voidPlatformInvoice(app, id, reason, billingActor(request));
      await auditBilling(request, 'invoice.void', 'invoice', id, null, { status: invoice.status, voidedAt: invoice.voidedAt }, reason);
      return reply.send(invoice);
    } catch (error) {
      return sendBillingError(reply, error);
    }
  });

  app.get('/api/internal/billing/payments', { preHandler: readPre }, async (request, reply) => {
    const query = parseList(request, reply);
    if (!query) return;
    const rows = await app.prisma.payment.findMany({
      where: { kind: query.kind, ...(query.tenantId ? { tenantId: query.tenantId } : {}), ...createdRange(query) },
      include: { tenant: tenantSelect, invoice: { select: { id: true, invoiceNumber: true, total: true, currency: true } }, refunds: { where: { kind: query.kind } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    return reply.send({ kind: query.kind, readOnly: query.kind !== PLATFORM, ...page(rows, query.limit) });
  });

  app.post('/api/internal/billing/payments', { preHandler: dangerous('revenue.invoices.write') }, async (request, reply) => {
    const parsed = manualPaymentBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: `${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}` });
    try {
      const result = await recordManualPayment(app, parsed.data, billingActor(request));
      await auditBilling(request, 'payment.record_manual', 'payment', result.payment.id, null, result, parsed.data.reason.trim());
      return reply.status(201).send(result);
    } catch (error) {
      return sendBillingError(reply, error);
    }
  });

  app.get('/api/internal/billing/credit-notes', { preHandler: readPre }, async (request, reply) => {
    const query = parseList(request, reply);
    if (!query) return;
    const rows = await app.prisma.creditNote.findMany({
      where: { kind: query.kind, ...(query.tenantId ? { tenantId: query.tenantId } : {}), ...createdRange(query) },
      include: { tenant: tenantSelect, invoice: { select: { id: true, invoiceNumber: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    return reply.send({ kind: query.kind, readOnly: query.kind !== PLATFORM, ...page(rows, query.limit) });
  });

  app.post('/api/internal/billing/credit-notes', { preHandler: dangerous('revenue.invoices.write') }, async (request, reply) => {
    const parsed = creditNoteBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: `${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}` });
    try {
      const credit = await createPlatformCreditNote(app, { ...parsed.data, reason: parsed.data.reason.trim() }, billingActor(request));
      await auditBilling(request, 'credit_note.create', 'credit_note', credit.id, null, credit, parsed.data.reason.trim());
      return reply.status(201).send(credit);
    } catch (error) {
      return sendBillingError(reply, error);
    }
  });

  app.get('/api/internal/billing/refunds', { preHandler: readPre }, async (request, reply) => {
    const query = request.query as { status?: string; kind?: string };
    const parsedKind = kindParam.safeParse(query.kind);
    const kind: LedgerKind = parsedKind.success ? parsedKind.data : PLATFORM;
    const data = await app.prisma.refund.findMany({
      where: { kind, status: query.status || undefined },
      include: { tenant: tenantSelect, payment: true, approvals: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return reply.send({ kind, readOnly: kind !== PLATFORM, data });
  });

  // WP-0.6: over-refund guard under a payment row lock, approval path for manual/large refunds, Stripe in minor units.
  // The console refunds PLATFORM payments only (D4).
  app.post('/api/internal/billing/refunds', { preHandler: dangerous('revenue.invoices.refund') }, async (request, reply) => {
    const body = request.body as { paymentId?: string; amount?: unknown; reason: string; idempotencyKey?: string };
    if (!body.paymentId || body.amount === undefined || body.amount === null || body.amount === '') {
      return reply.status(400).send({ error: 'paymentId and amount are required' });
    }
    const reason = body.reason.trim();
    const idempotencyKey = refundIdempotencyKey(request, body.paymentId, body.amount, reason, body.idempotencyKey);
    const canRefundLarge = await consoleUserHas(request, 'revenue.invoices.refund.large');
    try {
      const result = await requestRefund(app.prisma, { stripe: stripeService, largeRefundThreshold: config.billing.largeRefundThreshold }, {
        kind: PLATFORM,
        paymentId: body.paymentId,
        amount: body.amount,
        reason,
        idempotencyKey,
        actorId: request.platform!.user.id,
        canRefundLarge
      });
      if (!result.created) return reply.send({ refund: result.refund, path: result.path, approvalRequired: result.path === 'approval', replayed: true });
      await auditBilling(request, result.path === 'approval' ? 'refund.request' : 'invoice.refund', 'refund', result.refund.id, null, { refund: result.refund, path: result.path }, reason);
      await refundActivity(app, request, result.path === 'approval' ? 'refund.requested' : 'refund.issued', result.refund, reason);
      return reply.status(201).send({ refund: result.refund, path: result.path, approvalRequired: result.path === 'approval' });
    } catch (error) {
      if (error instanceof RefundError && error.code === 'VENDOR_ERROR') {
        await auditBilling(request, 'refund.failed', 'refund', String(error.extra.refundId ?? ''), null, { vendor: 'stripe', message: error.message }, reason);
      }
      return sendRefundError(reply, error);
    }
  });

  for (const decision of ['approve', 'reject'] as const) {
    app.post(`/api/internal/billing/refunds/:id/${decision}`, { preHandler: dangerous('revenue.invoices.refund') }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const reason = (request.body as { reason: string }).reason.trim();
      try {
        const refund = await decideRefund(app.prisma, { stripe: stripeService }, { kind: PLATFORM, refundId: id, decision: decision === 'approve' ? 'APPROVE' : 'REJECT', actorId: request.platform!.user.id, reason });
        await auditBilling(request, `refund.${decision}`, 'refund', id, null, { status: refund.status }, reason);
        await refundActivity(app, request, decision === 'approve' ? 'refund.approved' : 'refund.rejected', refund, reason);
        return reply.send({ refund });
      } catch (error) {
        if (error instanceof RefundError && error.code === 'VENDOR_ERROR') {
          await auditBilling(request, 'refund.failed', 'refund', id, null, { vendor: 'stripe', message: error.message }, reason);
        }
        return sendRefundError(reply, error);
      }
    });
  }
}
