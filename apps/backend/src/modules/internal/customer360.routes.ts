import type { FastifyInstance, FastifyRequest } from 'fastify';
import { writeAudit } from '@fauward/internal-audit';
import type { PlatformAuditClient } from '@fauward/internal-audit';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { requireInternalPermission } from '../../middleware/require-internal-permission.js';

async function auditCustomer(request: FastifyRequest, action: string, tenantId: string, before: unknown, after: unknown, reason?: string | null) {
  await writeAudit(request.server.prisma as unknown as PlatformAuditClient, {
    actor_id: request.platform!.user.id,
    actor_email: request.platform!.user.email,
    actor_role: request.platform!.user.role,
    action,
    target_type: 'tenant',
    target_id: tenantId,
    before,
    after,
    reason: reason ?? null,
    ip_address: request.ip,
    session_id: request.platform!.session.id,
    jit_session_id: null,
    user_agent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null
  });
}

export async function registerInternalCustomer360Routes(app: FastifyInstance) {
  app.get('/api/internal/customer/360/:tenantId', { preHandler: [authenticatePlatformSession, requireInternalPermission('customer.360.read')] }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const tenant = await app.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: { orderBy: { createdAt: 'desc' }, take: 50 },
        shipments: { orderBy: { createdAt: 'desc' }, take: 30 },
        invoices: { orderBy: { createdAt: 'desc' }, take: 20, include: { payments: true } },
        notificationLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
        auditLogs: { orderBy: { timestamp: 'desc' }, take: 20 }
      }
    });
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    const monthlyShipments = await app.prisma.shipment.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { id: true }
    });
    const [tickets, latestHealth, dunningEvents, incidentImpacts, contracts, pipeline, attribution] = await Promise.all([
      app.prisma.supportVendorTicket.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' }, take: 20 }),
      app.prisma.tenantHealthScore.findFirst({ where: { tenantId }, orderBy: { computedAt: 'desc' } }),
      app.prisma.dunningEvent.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      app.prisma.incidentTenantImpact.findMany({ where: { tenantId }, include: { incident: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
      app.prisma.customContract.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      app.prisma.salesDeal.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' }, take: 10 }),
      app.prisma.marketingAttribution.findMany({ where: { tenantId }, orderBy: { periodStart: 'desc' }, take: 10 })
    ]);
    reply.send({
      tenant,
      metrics: {
        shipmentCount: tenant.shipments.length,
        invoiceCount: tenant.invoices.length,
        userCount: tenant.users.length,
        notificationCount: tenant.notificationLogs.length,
        supportTicketCount: tickets.length,
        healthScore: latestHealth?.score ?? 78
      },
      usage: { shipmentStatusBreakdown: monthlyShipments },
      tickets,
      health: latestHealth ?? { score: 78, factors: ['Recent shipment activity', 'No connected Zendesk signal', 'Billing history available'], trend: 'flat' },
      dunning: { events: dunningEvents },
      incidents: { impacts: incidentImpacts },
      contracts,
      pipeline,
      attribution
    });
  });

  app.patch('/api/internal/customer/360/:tenantId/notes', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission('customer.success.write')] }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const body = request.body as { internalNotes?: string; reason?: string };
    const before = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { internalNotes: true } });
    if (!before) return reply.status(404).send({ error: 'Tenant not found' });
    const after = await app.prisma.tenant.update({ where: { id: tenantId }, data: { internalNotes: body.internalNotes ?? '' }, select: { internalNotes: true } });
    await auditCustomer(request, 'customer360.notes.update', tenantId, before, after, body.reason);
    reply.send(after);
  });
}
