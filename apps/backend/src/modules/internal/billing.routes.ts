import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { writeAudit } from '@fauward/internal-audit';
import type { PlatformAuditClient } from '@fauward/internal-audit';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { requireInternalPermission } from '../../middleware/require-internal-permission.js';
import { staffPermissionContextForPlatformUser } from '../../services/staff-iam.service.js';
import { stripeService } from '../payments/stripe.service.js';

const readPre = [authenticatePlatformSession, requireInternalPermission('revenue.invoices.read')];
const writePre = [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission('revenue.invoices.write')];

function money(value: unknown) {
  return new Prisma.Decimal(String(value ?? '0'));
}

function numberFromDecimal(value: Prisma.Decimal | null | undefined) {
  return Number(value ?? 0);
}

async function auditBilling(request: FastifyRequest, action: string, targetType: string, targetId: string, before: unknown, after: unknown, reason?: string | null) {
  await writeAudit(request.server.prisma as unknown as PlatformAuditClient, {
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
    jit_session_id: null,
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

  app.get('/api/internal/billing/refunds', { preHandler: readPre }, async (_request, reply) => {
    const data = await app.prisma.refund.findMany({ include: { tenant: true, payment: true, approvals: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    reply.send({ data });
  });

  app.post('/api/internal/billing/refunds', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission('revenue.invoices.refund')] }, async (request, reply) => {
    const body = request.body as { paymentId?: string; amount?: number; reason?: string };
    if (!body.paymentId || !body.amount || !body.reason) return reply.status(400).send({ error: 'paymentId, amount, and reason are required' });
    const payment = await app.prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!payment) return reply.status(404).send({ error: 'Payment not found' });
    const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
    const requiresLargeApproval = body.amount >= 500 && !context.permissions.includes('revenue.invoices.refund.large');
    const refund = await app.prisma.refund.create({
      data: { tenantId: payment.tenantId, paymentId: payment.id, amount: money(body.amount), reason: body.reason, status: requiresLargeApproval ? 'PENDING_APPROVAL' : 'APPROVED', initiatedBy: request.platform!.user.id }
    });
    if (requiresLargeApproval) {
      await app.prisma.refundApproval.create({ data: { refundId: refund.id, requestedBy: request.platform!.user.id, reason: body.reason } });
    } else if (payment.gatewayRef) {
      const stripeRefund = await stripeService.createRefund(payment.gatewayRef, Math.round(body.amount * 100), body.reason);
      await app.prisma.refund.update({ where: { id: refund.id }, data: { gatewayRef: stripeRefund.id, status: stripeRefund.status } });
    }
    await auditBilling(request, 'invoice.refund', 'refund', refund.id, payment, refund, body.reason);
    reply.status(201).send(refund);
  });
}
