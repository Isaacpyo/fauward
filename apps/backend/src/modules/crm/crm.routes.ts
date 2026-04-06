import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LeadStage, QuoteStatus, Prisma } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { resolveIdempotency, storeIdempotencyResult } from '../../shared/middleware/idempotency.js';
import { generateTrackingNumber } from '../../shared/utils/trackingNumber.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

async function nextQuoteNumber(app: FastifyInstance, tenantId: string, tenantSlug: string) {
  const year = new Date().getUTCFullYear();
  const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');
  const prefix = `${tenantSlug.toUpperCase()}-QTE-${year}${month}-`;
  const count = await app.prisma.quote.count({
    where: { tenantId, quoteNumber: { startsWith: prefix } }
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

export async function registerCrmRoutes(app: FastifyInstance) {
  app.get('/api/v1/crm/leads', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const query = req.query as { stage?: string; page?: string; limit?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));

    const where: Prisma.LeadWhereInput = {
      tenantId,
      stage: query.stage ? (query.stage as LeadStage) : undefined
    };

    const [leads, total] = await Promise.all([
      app.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      app.prisma.lead.count({ where })
    ]);

    reply.send({
      data: leads,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  app.post('/api/v1/crm/leads', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const payload = req.body as {
      company?: string;
      contactName?: string;
      email?: string;
      phone?: string;
      assignedTo?: string;
      notes?: string;
      source?: string;
    };

    const lead = await app.prisma.lead.create({
      data: {
        tenantId,
        company: payload.company,
        contactName: payload.contactName,
        email: payload.email,
        phone: payload.phone,
        stage: 'PROSPECT',
        assignedTo: payload.assignedTo,
        notes: payload.notes,
        source: payload.source
      }
    });

    reply.status(201).send(lead);
  });

  app.patch('/api/v1/crm/leads/:id', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const payload = req.body as {
      stage?: LeadStage;
      assignedTo?: string;
      notes?: string;
      lostReason?: string;
    };

    const lead = await app.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) return reply.status(404).send({ error: 'Lead not found' });

    const updated = await app.prisma.lead.update({
      where: { id: lead.id },
      data: {
        stage: payload.stage,
        assignedTo: payload.assignedTo,
        notes: payload.notes,
        lostReason: payload.lostReason,
        wonAt: payload.stage === 'WON' ? new Date() : lead.wonAt,
        lostAt: payload.stage === 'LOST' ? new Date() : lead.lostAt
      }
    });

    reply.send(updated);
  });

  app.get('/api/v1/crm/leads/:id', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const lead = await app.prisma.lead.findFirst({
      where: { id, tenantId },
      include: {
        quotes: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!lead) return reply.status(404).send({ error: 'Lead not found' });
    reply.send(lead);
  });

  app.delete('/api/v1/crm/leads/:id', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const lead = await app.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) return reply.status(404).send({ error: 'Lead not found' });
    if (!['PROSPECT', 'LOST'].includes(lead.stage)) {
      return reply.status(400).send({ error: 'Only PROSPECT or LOST leads can be deleted' });
    }

    await app.prisma.lead.delete({ where: { id: lead.id } });
    reply.status(204).send();
  });

  app.get('/api/v1/crm/quotes', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const query = req.query as { status?: string };
    const quotes = await app.prisma.quote.findMany({
      where: {
        tenantId,
        status: query.status ? (query.status as QuoteStatus) : undefined
      },
      orderBy: { createdAt: 'desc' }
    });

    reply.send({ data: quotes });
  });

  app.post('/api/v1/crm/quotes', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const idempotency = await resolveIdempotency(req, reply);
    if (idempotency.type === 'duplicate') return reply.status(idempotency.statusCode).send(idempotency.response);
    if (idempotency.type === 'processing') return reply.status(409).send({ error: 'Duplicate request in flight' });

    const payload = req.body as {
      leadId?: string;
      customerId?: string;
      organisationId?: string;
      shipmentData?: Record<string, unknown>;
      lineItems?: Array<Record<string, unknown>>;
      subtotal?: number;
      total?: number;
      currency?: string;
      validUntil?: string;
    };

    const quote = await app.prisma.quote.create({
      data: {
        tenantId,
        quoteNumber: await nextQuoteNumber(app, tenantId, req.tenant?.slug ?? 'TENANT'),
        leadId: payload.leadId,
        customerId: payload.customerId,
        organisationId: payload.organisationId,
        shipmentData: (payload.shipmentData ?? {}) as Prisma.InputJsonValue,
        lineItems: (payload.lineItems ?? []) as Prisma.InputJsonValue,
        subtotal: payload.subtotal ?? 0,
        total: payload.total ?? 0,
        currency: payload.currency ?? req.tenant?.defaultCurrency ?? 'GBP',
        validUntil: payload.validUntil ? new Date(payload.validUntil) : undefined,
        status: 'DRAFT',
        createdBy: req.user?.sub
      }
    });

    if (idempotency.type === 'new') {
      await storeIdempotencyResult(req, idempotency.key, 201, quote);
    }

    reply.status(201).send(quote);
  });

  app.patch('/api/v1/crm/quotes/:id', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const payload = req.body as {
      shipmentData?: Record<string, unknown>;
      lineItems?: Array<Record<string, unknown>>;
      subtotal?: number;
      total?: number;
      validUntil?: string;
      notes?: string;
    };

    const quote = await app.prisma.quote.findFirst({ where: { id, tenantId } });
    if (!quote) return reply.status(404).send({ error: 'Quote not found' });
    if (quote.status !== 'DRAFT') {
      return reply.status(400).send({ error: 'Only DRAFT quotes can be updated' });
    }

    const updated = await app.prisma.quote.update({
      where: { id: quote.id },
      data: {
        shipmentData: payload.shipmentData ? (payload.shipmentData as Prisma.InputJsonValue) : undefined,
        lineItems: payload.lineItems ? (payload.lineItems as Prisma.InputJsonValue) : undefined,
        subtotal: payload.subtotal,
        total: payload.total,
        validUntil: payload.validUntil ? new Date(payload.validUntil) : undefined
      }
    });

    reply.send(updated);
  });

  app.post('/api/v1/crm/quotes/:id/send', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const quote = await app.prisma.quote.findFirst({ where: { id, tenantId } });
    if (!quote) return reply.status(404).send({ error: 'Quote not found' });

    const updated = await app.prisma.quote.update({
      where: { id: quote.id },
      data: { status: 'SENT' }
    });

    await app.prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'EMAIL',
        event: 'quote_sent',
        status: 'QUEUED'
      }
    });

    reply.send(updated);
  });

  app.post('/api/v1/crm/quotes/:id/accept', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const quote = await app.prisma.quote.findFirst({ where: { id, tenantId } });
    if (!quote) return reply.status(404).send({ error: 'Quote not found' });

    const shipmentData = (quote.shipmentData as Record<string, unknown>) ?? {};
    const shipment = await app.prisma.$transaction(async (tx) => {
      const createdShipment = await tx.shipment.create({
        data: {
          tenantId,
          trackingNumber: await generateTrackingNumber(tx, req.tenant?.slug ?? 'TENANT'),
          customerId: quote.customerId,
          organisationId: quote.organisationId,
          originAddress: ((shipmentData.originAddress as Record<string, unknown>) ?? {}) as Prisma.InputJsonValue,
          destinationAddress: ((shipmentData.destinationAddress as Record<string, unknown>) ?? {}) as Prisma.InputJsonValue,
          serviceTier: String(shipmentData.serviceTier ?? 'STANDARD'),
          notes: typeof shipmentData.notes === 'string' ? shipmentData.notes : undefined,
          price: quote.total ?? 0,
          currency: quote.currency
        }
      });

      await tx.quote.update({
        where: { id: quote.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          shipmentId: createdShipment.id
        }
      });

      if (quote.leadId) {
        await tx.lead.update({
          where: { id: quote.leadId },
          data: { stage: 'WON', wonAt: new Date() }
        });
      }

      return createdShipment;
    });

    reply.send({ shipmentId: shipment.id });
  });

  app.post('/api/v1/crm/quotes/:id/reject', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const quote = await app.prisma.quote.findFirst({ where: { id, tenantId } });
    if (!quote) return reply.status(404).send({ error: 'Quote not found' });

    await app.prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id: quote.id },
        data: { status: 'REJECTED', rejectedAt: new Date() }
      });

      if (quote.leadId) {
        await tx.lead.update({
          where: { id: quote.leadId },
          data: { stage: 'LOST', lostAt: new Date(), lostReason: 'Quote rejected' }
        });
      }
    });

    reply.send({ success: true });
  });

  app.get('/api/v1/crm/customers', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const organisations = await app.prisma.organisation.findMany({
      where: { tenantId },
      include: { shipments: true, invoices: true }
    });

    reply.send({
      data: organisations.map((organisation) => ({
        id: organisation.id,
        name: organisation.name,
        shipmentCount: organisation.shipments.length,
        totalRevenue: organisation.invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0),
        billingEmail: organisation.billingEmail,
        isActive: organisation.isActive
      }))
    });
  });

  app.get('/api/v1/crm/customers/:id', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const organisation = await app.prisma.organisation.findFirst({
      where: { id, tenantId },
      include: {
        users: true,
        shipments: { orderBy: { createdAt: 'desc' }, take: 50 },
        invoices: { orderBy: { createdAt: 'desc' }, take: 50 }
      }
    });

    if (!organisation) return reply.status(404).send({ error: 'Organisation not found' });
    reply.send(organisation);
  });

  app.post('/api/v1/crm/customers', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const payload = req.body as {
      name?: string;
      companyNumber?: string;
      taxNumber?: string;
      billingEmail?: string;
      billingAddress?: Record<string, unknown>;
      paymentTerms?: number;
      creditLimit?: number;
      notes?: string;
    };

    if (!payload.name) return reply.status(400).send({ error: 'name is required' });

    const organisation = await app.prisma.organisation.create({
      data: {
        tenantId,
        name: payload.name,
        companyNumber: payload.companyNumber,
        taxNumber: payload.taxNumber,
        billingEmail: payload.billingEmail,
        billingAddress: payload.billingAddress as Prisma.InputJsonValue,
        paymentTerms: payload.paymentTerms ?? 0,
        creditLimit: payload.creditLimit ?? 0,
        notes: payload.notes
      }
    });

    reply.status(201).send(organisation);
  });

  app.patch('/api/v1/crm/customers/:id', { preHandler: [authenticate, requireFeature('crmModule')] }, async (req, reply) => {
    const tenantId = getTenantId(req, reply);
    if (!tenantId) return;

    const { id } = req.params as { id: string };
    const payload = req.body as {
      name?: string;
      companyNumber?: string;
      taxNumber?: string;
      billingEmail?: string;
      billingAddress?: Record<string, unknown>;
      paymentTerms?: number;
      creditLimit?: number;
      notes?: string;
      isActive?: boolean;
    };

    const organisation = await app.prisma.organisation.findFirst({ where: { id, tenantId } });
    if (!organisation) return reply.status(404).send({ error: 'Organisation not found' });

    const updated = await app.prisma.organisation.update({
      where: { id: organisation.id },
      data: {
        name: payload.name,
        companyNumber: payload.companyNumber,
        taxNumber: payload.taxNumber,
        billingEmail: payload.billingEmail,
        billingAddress: payload.billingAddress ? (payload.billingAddress as Prisma.InputJsonValue) : undefined,
        paymentTerms: payload.paymentTerms,
        creditLimit: payload.creditLimit,
        notes: payload.notes,
        isActive: payload.isActive
      }
    });

    reply.send(updated);
  });
}
