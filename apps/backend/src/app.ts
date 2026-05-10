import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { registerPrisma } from './plugins/prisma.js';
import { registerRedis } from './plugins/redis.js';
import { authenticate } from './shared/middleware/authenticate.js';
import { tenantResolver } from './shared/middleware/tenant.resolver.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerShipmentRoutes } from './modules/shipments/shipments.routes.js';
import { runWithTenantContext } from './context/tenant.context.js';
import { registerTenantRoutes } from './modules/tenants/tenant.routes.js';
import { registerApiKeyRoutes } from './modules/api-keys/api-keys.routes.js';
import { registerWebhookRoutes } from './modules/webhooks/webhooks.routes.js';
import { registerCrmRoutes } from './modules/crm/crm.routes.js';
import { registerFinanceRoutes } from './modules/finance/finance.routes.js';
import { registerAnalyticsRoutes } from './modules/analytics/analytics.routes.js';
import { registerAuditRoutes } from './modules/audit/audit.routes.js';
import { registerDriverRoutes } from './modules/driver/driver.routes.js';
import { registerAgentRoutes as registerFieldAgentRoutes } from './modules/agents/agent.routes.js';
import { registerAgentRoutes as registerFauwardAgentRoutes } from './modules/agent/agent.routes.js';
import { registerUsersRoutes } from './modules/users/users.routes.js';
import { registerNotificationsRoutes } from './modules/notifications/notifications.routes.js';
import { registerReturnsRoutes } from './modules/returns/returns.routes.js';
import { registerSupportRoutes } from './modules/support/support.routes.js';
import { registerPricingRoutes } from './modules/pricing/pricing.routes.js';
import { registerRatingRoutes } from './modules/rating/rating.routes.js';
import { registerShippingRulesRoutes } from './modules/shipping-rules/shipping-rules.routes.js';
import { registerCustomsRoutes } from './modules/customs/customs.routes.js';
import { registerExceptionsRoutes } from './modules/exceptions/exceptions.routes.js';
import { registerControlTowerRoutes } from './modules/control-tower/control-tower.routes.js';
import { startStuckShipmentDetector } from './modules/control-tower/stuck-shipment.detector.js';
import { registerFleetRoutes } from './modules/fleet/fleet.routes.js';
import { registerLabelRoutes } from './modules/documents/label.routes.js';
import { registerDocumentsRoutes } from './modules/documents/documents.routes.js';
import { registerPublicTrackingRoutes } from './modules/tracking/tracking.public.routes.js';
import { registerTenantTrackingRoutes } from './modules/tracking/tracking.tenant.routes.js';
import { registerPlatformTrackingRoutes } from './modules/tracking/tracking.platform.routes.js';
import { registerGoTrackingRoutes } from './modules/tracking/tracking.go.routes.js';
import { registerPaymentsRoutes } from './modules/payments/payments.routes.js';
import { registerSuperAdminRoutes } from './modules/super-admin/super-admin.routes.js';
import { registerPlatformRoutes } from './modules/platform/platform.routes.js';
import { registerInternalIamRoutes } from './modules/internal/iam.routes.js';
import { registerInternalAuditRoutes } from './modules/internal/audit.routes.js';
import { auditMiddleware } from '@fauward/internal-audit';
import type { PlatformAuditClient } from '@fauward/internal-audit';
import { registerFieldRoutes } from './modules/field/field.routes.js';
import { registerRelayRoutes } from './modules/relay/relay.routes.js';
import { enforceTenantStatus } from './middleware/enforce-tenant-status.js';
import { setupTrackingWebsocket } from './modules/tracking/tracking.websocket.js';
import { registerRoutingRoutes } from './modules/routing/routing.routes.js';
import { startRouteOptimizationWorker } from './queues/route-optimization.worker.js';

function escapeRegex(source: string) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAllowedCorsOrigin(origin: string) {
  const platformDomain = escapeRegex(config.platformDomain.toLowerCase());
  const rules = [
    /^https?:\/\/localhost(?::\d+)?$/i,
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
    new RegExp(`^https?:\\/\\/([a-z0-9-]+\\.)*${platformDomain}$`, 'i')
  ];
  return rules.some((rule) => rule.test(origin));
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(sensible);
  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'), false);
    },
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Slug', 'X-CSRF-Token'],
    credentials: true
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwt.accessSecret });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      error: 'Rate limit exceeded',
      code: 'RATE_LIMITED',
      retryAfter: Number(context.after ?? 60),
      upgradeUrl: 'https://fauward.com/upgrade'
    })
  });

  app.decorate('authenticate', authenticate);

  await registerPrisma(app);
  await registerRedis(app);

  app.addHook('preHandler', auditMiddleware({ prisma: app.prisma as unknown as PlatformAuditClient, shouldAudit: (request) => {
    const method = request.method?.toUpperCase();
    return Boolean(request.url?.startsWith('/api/internal/') && method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method));
  } }));

  app.addHook('onRequest', (req, reply, done) => {
    (async () => {
      const ctx = await tenantResolver(req, reply);
      if (!ctx) return done();
      runWithTenantContext(ctx, done);
    })().catch(done);
  });
  app.addHook('preHandler', enforceTenantStatus);

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await registerAuthRoutes(app);
  await registerShipmentRoutes(app);
  await registerTenantRoutes(app);
  await registerPublicTrackingRoutes(app);
  await registerTenantTrackingRoutes(app);
  await registerPlatformTrackingRoutes(app);
  await registerGoTrackingRoutes(app);
  await registerApiKeyRoutes(app);
  await registerWebhookRoutes(app);
  await registerCrmRoutes(app);
  await registerFinanceRoutes(app);
  await registerPaymentsRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerAuditRoutes(app);
  await registerDriverRoutes(app);
  await registerFieldRoutes(app);
  await registerFieldAgentRoutes(app);
  await registerFauwardAgentRoutes(app);
  await registerUsersRoutes(app);
  await registerNotificationsRoutes(app);
  await registerReturnsRoutes(app);
  await registerSupportRoutes(app);
  await registerRelayRoutes(app);
  await registerPricingRoutes(app);
  await registerRatingRoutes(app);
  await registerShippingRulesRoutes(app);
  await registerCustomsRoutes(app);
  await registerExceptionsRoutes(app);
  await registerControlTowerRoutes(app);
  await registerFleetRoutes(app);
  await registerPlatformRoutes(app);
  await registerInternalIamRoutes(app);
  await registerInternalAuditRoutes(app);
  await registerSuperAdminRoutes(app);
  await registerLabelRoutes(app);
  await registerDocumentsRoutes(app);

  await registerRoutingRoutes(app);

  await setupTrackingWebsocket(app);
  startStuckShipmentDetector(app);
  startRouteOptimizationWorker();

  return app;
}
