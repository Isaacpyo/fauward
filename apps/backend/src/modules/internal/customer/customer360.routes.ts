import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Permission } from '@fauward/internal-rbac';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { mrrForSubscription } from '../../../services/revenue/mrr.service.js';
import { resolveTenantEntitlements } from '../../../services/tenant-entitlements.service.js';

// customer.360 (WP-1.8): one endpoint per tab, each with its own permission, so a failing or forbidden tab never takes
// the others down. Every query names the tenant (console requests run in system context, architecture §7). Counts are
// count queries, never the length of a capped list.

const CUSTOMER_ROLES = ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] as const;

function monthKeys(count: number, now = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function pre(permission: Permission) {
  return { preHandler: [authenticatePlatformSession, requireConsolePermission(permission)] };
}

/** 404 unless the tenant exists; returns its id and basic fields. */
async function tenantOr404(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = request.params as { tenantId: string };
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    reply.status(404).send({ error: 'NOT_FOUND', message: 'Tenant not found' });
    return null;
  }
  return tenant;
}

export async function registerCustomer360Routes(app: FastifyInstance) {
  app.get('/api/internal/customer360/:tenantId/summary', pre('customer.360.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    const [subscription, entitlements, lastLogin, health, activeSuspensions, users, openTickets] = await Promise.all([
      app.prisma.subscription.findUnique({ where: { tenantId: tenant.id }, select: { plan: true, billingCycle: true, status: true, currentPeriodEnd: true } }),
      resolveTenantEntitlements(app.prisma, tenant),
      app.prisma.user.aggregate({ where: { tenantId: tenant.id }, _max: { lastLogin: true } }),
      app.prisma.tenantHealthScore.findFirst({ where: { tenantId: tenant.id }, orderBy: { computedAt: 'desc' }, select: { score: true, trend: true, computedAt: true } }),
      app.prisma.suspensionRecord.findMany({ where: { tenantId: tenant.id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, select: { id: true, source: true, category: true, publicReason: true, createdAt: true } }),
      app.prisma.user.count({ where: { tenantId: tenant.id, isActive: true, role: { notIn: [...CUSTOMER_ROLES] } } }),
      app.prisma.supportTicket.count({ where: { tenantId: tenant.id, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] } } })
    ]);
    return reply.send({
      identity: { id: tenant.id, name: tenant.name, slug: tenant.slug, customDomain: tenant.customDomain, region: tenant.region, createdAt: tenant.createdAt.toISOString() },
      status: tenant.status,
      closedAt: tenant.closedAt?.toISOString() ?? null,
      plan: { billingPlan: entitlements.billingPlan, effectivePlan: entitlements.effectivePlan, planOverride: entitlements.planOverride },
      activeSuspensions,
      mrr: await mrrForSubscription(app.prisma, tenant, subscription),
      subscription,
      lastLoginAt: lastLogin._max.lastLogin?.toISOString() ?? null,
      // No score yet is shown as "Not yet scored" — never a made-up number (ACC-C360-4).
      health: health ? { score: health.score, trend: health.trend, computedAt: health.computedAt.toISOString() } : null,
      kycStatus: tenant.kycStatus,
      activeStaff: users,
      // Support tickets have no audience until WP-2.3; this is every open ticket of the tenant.
      openTickets
    });
  });

  app.get('/api/internal/customer360/:tenantId/usage', pre('customer.360.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    const months = monthKeys(12);
    const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [usage, entitlements, apiKeys, apiCalls30d, apiErrors30d, shipmentsTotal] = await Promise.all([
      app.prisma.usageRecord.findMany({ where: { tenantId: tenant.id, month: { in: months } }, orderBy: { month: 'desc' } }),
      resolveTenantEntitlements(app.prisma, tenant),
      app.prisma.apiKey.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, keyPrefix: true, isActive: true, lastUsedAt: true, monthlyRequestCount: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
      app.prisma.apiUsageRecord.count({ where: { tenantId: tenant.id, timestamp: { gte: since30Days } } }),
      app.prisma.apiUsageRecord.count({ where: { tenantId: tenant.id, timestamp: { gte: since30Days }, statusCode: { gte: 400 } } }),
      app.prisma.shipment.count({ where: { tenantId: tenant.id } })
    ]);
    const byMonth = new Map(usage.map((row) => [row.month, row]));
    const staff = await app.prisma.user.count({ where: { tenantId: tenant.id, isActive: true, role: { notIn: [...CUSTOMER_ROLES] } } });
    return reply.send({
      months: months.map((month) => ({ month, shipments: byMonth.get(month)?.shipments ?? 0, apiCalls: byMonth.get(month)?.apiCalls ?? 0, smsSent: byMonth.get(month)?.smsSent ?? 0, emailsSent: byMonth.get(month)?.emailsSent ?? 0 })),
      limits: entitlements.limits,
      limitsSource: entitlements.limitsSource,
      current: { shipmentsThisMonth: byMonth.get(months[0])?.shipments ?? 0, staff },
      shipmentsTotal,
      api: { keys: apiKeys, callsLast30Days: apiCalls30d, errorsLast30Days: apiErrors30d }
    });
  });

  app.get('/api/internal/customer360/:tenantId/billing', pre('revenue.invoices.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    const [subscription, invoices, invoiceCount, payments, dunningEvents, saveOffers] = await Promise.all([
      app.prisma.subscription.findUnique({ where: { tenantId: tenant.id } }),
      app.prisma.invoice.findMany({ where: { tenantId: tenant.id, kind: 'PLATFORM' }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, invoiceNumber: true, status: true, total: true, currency: true, dueDate: true, createdAt: true } }),
      app.prisma.invoice.count({ where: { tenantId: tenant.id, kind: 'PLATFORM' } }),
      app.prisma.payment.findMany({ where: { tenantId: tenant.id, kind: 'PLATFORM' }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, amount: true, currency: true, status: true, method: true, createdAt: true, invoiceId: true } }),
      app.prisma.dunningEvent.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      app.prisma.saveOffer.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' }, take: 10 })
    ]);
    return reply.send({
      subscription: subscription
        ? { plan: subscription.plan, billingCycle: subscription.billingCycle, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, stripeLinked: Boolean(subscription.stripeSubscriptionId) }
        : null,
      invoices: invoices.map((invoice) => ({ ...invoice, total: invoice.total.toFixed(2) })),
      invoiceCount,
      payments: payments.map((payment) => ({ ...payment, amount: payment.amount.toFixed(2) })),
      dunning: dunningEvents,
      saveOffers: saveOffers.map((offer) => ({ ...offer, discount: offer.discount.toFixed(2) }))
    });
  });

  app.get('/api/internal/customer360/:tenantId/tickets', pre('customer.support.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    const [tickets, byStatus, total] = await Promise.all([
      app.prisma.supportTicket.findMany({
        where: { tenantId: tenant.id },
        orderBy: { updatedAt: 'desc' },
        take: 25,
        select: { id: true, ticketNumber: true, subject: true, category: true, priority: true, status: true, createdAt: true, updatedAt: true }
      }),
      app.prisma.supportTicket.groupBy({ by: ['status'], where: { tenantId: tenant.id }, _count: { _all: true } }),
      app.prisma.supportTicket.count({ where: { tenantId: tenant.id } })
    ]);
    return reply.send({ tickets, total, byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])), audienceTracked: false });
  });

  app.get('/api/internal/customer360/:tenantId/health', pre('customer.success.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const history = await app.prisma.tenantHealthScore.findMany({ where: { tenantId: tenant.id, computedAt: { gte: since } }, orderBy: { computedAt: 'desc' }, take: 200 });
    const latest = history[0] ?? null;
    return reply.send({
      latest: latest ? { score: latest.score, trend: latest.trend, factors: latest.factors, computedAt: latest.computedAt.toISOString() } : null,
      history: history.map((row) => ({ score: row.score, computedAt: row.computedAt.toISOString() }))
    });
  });

  app.get('/api/internal/customer360/:tenantId/ai', pre('customer.360.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    const [usage, runs, runCount, limit] = await Promise.all([
      app.prisma.tenantAiUsage.findMany({ where: { tenantId: tenant.id, month: { in: monthKeys(6) } }, orderBy: [{ month: 'desc' }, { feature: 'asc' }] }),
      app.prisma.aiAgentRun.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, agentType: true, status: true, stage: true, scannedCount: true, flaggedCount: true, proposedCount: true, durationMs: true, createdAt: true, finishedAt: true } }),
      app.prisma.aiAgentRun.count({ where: { tenantId: tenant.id } }),
      app.prisma.tenantAiLimit.findUnique({ where: { tenantId: tenant.id } })
    ]);
    return reply.send({ usage, runs, runCount, limit });
  });

  app.get('/api/internal/customer360/:tenantId/audit', pre('trust.audit.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    const query = request.query as { cursor?: string; limit?: string };
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
    const [tenantRows, platformRows] = await Promise.all([
      app.prisma.auditLog.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: { id: true, action: true, actorType: true, actorId: true, resourceType: true, resourceId: true, timestamp: true, metadata: true }
      }),
      query.cursor ? Promise.resolve([]) : app.prisma.platformAuditLog.findMany({ where: { targetTenantId: tenant.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, actorEmail: true, reason: true, createdAt: true } })
    ]);
    const hasMore = tenantRows.length > limit;
    const tenantPage = hasMore ? tenantRows.slice(0, limit) : tenantRows;
    return reply.send({ tenantAudit: tenantPage, nextCursor: hasMore ? tenantPage[tenantPage.length - 1]?.id ?? null : null, platformAudit: platformRows });
  });

  app.get('/api/internal/customer360/:tenantId/people', pre('customer.360.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    const [users, total] = await Promise.all([
      app.prisma.user.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
        take: 200,
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, mfaEnabled: true, lastLogin: true, invitedBy: true, createdAt: true }
      }),
      app.prisma.user.count({ where: { tenantId: tenant.id } })
    ]);
    return reply.send({ users, total });
  });

  app.get('/api/internal/customer360/:tenantId/config', pre('platform.tenants.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [settings, apiKeys, webhooks] = await Promise.all([
      app.prisma.tenantSettings.findUnique({ where: { tenantId: tenant.id } }),
      app.prisma.apiKey.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, keyPrefix: true, scopes: true, isActive: true, isSandbox: true, createdAt: true, lastUsedAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }),
      app.prisma.webhookEndpoint.findMany({ where: { tenantId: tenant.id }, select: { id: true, url: true, events: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'desc' } })
    ]);
    const failures = await Promise.all(
      webhooks.map((hook) => app.prisma.webhookDelivery.count({ where: { tenantId: tenant.id, endpointId: hook.id, createdAt: { gte: since30Days }, status: 'FAILED' } }))
    );
    // Structured and redacted (ACC-C360-6): no gateway keys, webhook secrets or key hashes ever leave the API.
    return reply.send({
      general: { timezone: tenant.timezone, defaultCurrency: tenant.defaultCurrency, defaultLanguage: tenant.defaultLanguage, region: tenant.region, isRtl: tenant.isRtl, smsEnabled: tenant.smsEnabled, showPoweredBy: tenant.showPoweredBy },
      branding: { brandName: tenant.brandName, logoUrl: tenant.logoUrl, primaryColor: tenant.primaryColor, accentColor: tenant.accentColor, trackingHeadline: tenant.trackingHeadline },
      domains: { slug: tenant.slug, customDomain: tenant.customDomain, customDomainStatus: tenant.customDomainStatus, customDomainVerifiedAt: tenant.customDomainVerifiedAt?.toISOString() ?? null, customDomainError: tenant.customDomainError },
      notifications: settings
        ? { notificationEmail: settings.notificationEmail, emailFromName: settings.emailFromName, emailReplyTo: settings.emailReplyTo, customEmailDomain: settings.customEmailDomain, opsEmailRecipients: settings.opsEmailRecipients, notifyOnStaffAccess: settings.notifyOnStaffAccess }
        : null,
      payments: settings ? { gateway: settings.paymentGateway, gatewayKeyConfigured: Boolean(settings.paymentGatewayKey), currency: settings.currency } : null,
      apiKeys,
      webhooks: webhooks.map((hook, index) => ({ ...hook, failuresLast30Days: failures[index], secretConfigured: true })),
      legacyWebhook: settings ? { url: settings.webhookUrl, secretConfigured: Boolean(settings.webhookSecret) } : null
    });
  });

  app.get('/api/internal/customer360/:tenantId/notes', pre('customer.360.read'), async (request, reply) => {
    const tenant = await tenantOr404(app, request, reply);
    if (!tenant) return;
    return reply.send({ internalNotes: tenant.internalNotes ?? '', editPath: `/api/internal/tenants/${tenant.id}/internal-notes` });
  });
}
