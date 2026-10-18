import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { writeAudit } from '@fauward/internal-audit';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { consoleUserHas, requireConsolePermission } from '../../middleware/require-console-permission.js';
import { dangerous } from '../../middleware/dangerous.js';
import { config } from '../../config/index.js';
import { platformAuditClient } from '../../services/platform-audit-client.js';
import { RefundError, decideRefund, requestRefund } from '../../services/refund.service.js';
import { stripeService } from '../payments/stripe.service.js';

const readPre = [authenticatePlatformSession, requireConsolePermission('revenue.invoices.read')];
const writePre = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('revenue.invoices.write')];

function money(value: unknown) {
  return new Prisma.Decimal(String(value ?? '0'));
}

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

export async function registerInternalBillingRoutes(app: FastifyInstance) {
  app.get('/api/internal/billing/invoices', { preHandler: readPre }, async (request, reply) => {
    const query = request.query as { tenantId?: string; status?: string; from?: string; to?: string; min?: string; max?: string; limit?: string };
    const invoices = await app.prisma.invoice.findMany({
      where: {
        tenantId: query.tenantId,
        status: query.status as never,
        createdAt: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } : undefined,
        total: query.min || query.max ? { gte: query.min ? money(query.min) : undefined, lte: query.max ? money(query.max) : undefined } : undefined
      },
      include: { tenant: { select: { id: true, name: true, slug: true } }, payments: true, creditNotes: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Number(query.limit ?? 50))
    });
    reply.send({ data: invoices });
  });

  app.get('/api/internal/billing/invoices/:id', { preHandler: readPre }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = await app.prisma.invoice.findUnique({ where: { id }, include: { tenant: true, payments: { include: { refunds: { include: { approvals: true } } } }, creditNotes: true } });
    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    reply.send(invoice);
  });

  app.post('/api/internal/billing/invoices', { preHandler: writePre }, async (request, reply) => {
    const body = request.body as { tenantId?: string; dueDate?: string; currency?: string; lineItems?: Array<{ description: string; quantity: number; unitAmount: number }>; taxRate?: number; notes?: string; reason?: string };
    if (!body.tenantId || !body.lineItems?.length) return reply.status(400).send({ error: 'tenantId and lineItems are required' });
    const subtotal = body.lineItems.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);
    const taxAmount = subtotal * ((body.taxRate ?? 0) / 100);
    const invoice = await app.prisma.invoice.create({
      data: {
        tenantId: body.tenantId,
        invoiceNumber: `MAN-${Date.now()}`,
        lineItems: body.lineItems as unknown as Prisma.InputJsonValue,
        subtotal: money(subtotal),
        taxRate: money(body.taxRate ?? 0),
        taxAmount: money(taxAmount),
        total: money(subtotal + taxAmount),
        currency: body.currency ?? 'GBP',
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes,
        createdBy: request.platform!.user.id
      }
    });
    await auditBilling(request, 'invoice.create', 'invoice', invoice.id, null, invoice, body.reason);
    reply.status(201).send(invoice);
  });

  app.get('/api/internal/billing/payments', { preHandler: readPre }, async (_request, reply) => {
    const data = await app.prisma.payment.findMany({ include: { tenant: true, invoice: true, refunds: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    reply.send({ data });
  });

  app.get('/api/internal/billing/credit-notes', { preHandler: readPre }, async (_request, reply) => {
    const data = await app.prisma.creditNote.findMany({ include: { tenant: true, invoice: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    reply.send({ data });
  });

  app.post('/api/internal/billing/credit-notes', { preHandler: writePre }, async (request, reply) => {
    const body = request.body as { tenantId?: string; invoiceId?: string; amount?: number; currency?: string; reason?: string };
    if (!body.tenantId || !body.amount) return reply.status(400).send({ error: 'tenantId and amount are required' });
    const credit = await app.prisma.creditNote.create({
      data: { tenantId: body.tenantId, invoiceId: body.invoiceId, creditNumber: `CN-${Date.now()}`, amount: money(body.amount), currency: body.currency ?? 'GBP', reason: body.reason }
    });
    await auditBilling(request, 'credit_note.create', 'credit_note', credit.id, null, credit, body.reason);
    reply.status(201).send(credit);
  });

  app.get('/api/internal/billing/refunds', { preHandler: readPre }, async (request, reply) => {
    const query = request.query as { status?: string };
    const data = await app.prisma.refund.findMany({
      where: { status: query.status || undefined },
      include: { tenant: { select: { id: true, name: true, slug: true } }, payment: true, approvals: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    reply.send({ data });
  });

  // WP-0.6: over-refund guard under a payment row lock, approval path for manual/large refunds, Stripe in minor units.
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
        paymentId: body.paymentId,
        amount: body.amount,
        reason,
        idempotencyKey,
        actorId: request.platform!.user.id,
        canRefundLarge
      });
      if (!result.created) return reply.send({ refund: result.refund, path: result.path, approvalRequired: result.path === 'approval', replayed: true });
      await auditBilling(request, result.path === 'approval' ? 'refund.request' : 'invoice.refund', 'refund', result.refund.id, null, { refund: result.refund, path: result.path }, reason);
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
        const refund = await decideRefund(app.prisma, { stripe: stripeService }, { refundId: id, decision: decision === 'approve' ? 'APPROVE' : 'REJECT', actorId: request.platform!.user.id, reason });
        await auditBilling(request, `refund.${decision}`, 'refund', id, null, { status: refund.status }, reason);
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
