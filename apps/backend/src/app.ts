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
import { registerUsersRoutes } from './modules/users/users.routes.js';
import { registerNotificationsRoutes } from './modules/notifications/notifications.routes.js';
import { registerReturnsRoutes } from './modules/returns/returns.routes.js';
import { registerSupportRoutes } from './modules/support/support.routes.js';
import { registerPricingRoutes } from './modules/pricing/pricing.routes.js';
import { registerFleetRoutes } from './modules/fleet/fleet.routes.js';
import { registerLabelRoutes } from './modules/documents/label.routes.js';
import { registerDocumentsRoutes } from './modules/documents/documents.routes.js';
import { registerTrackingRoutes } from './modules/tracking/tracking.routes.js';
import { registerPaymentsRoutes } from './modules/payments/payments.routes.js';
import { registerSuperAdminRoutes } from './modules/super-admin/super-admin.routes.js';
import { setupTrackingWebsocket } from './modules/tracking/tracking.websocket.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(sensible);
  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
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

  app.addHook('onRequest', (req, reply, done) => {
    (async () => {
      const ctx = await tenantResolver(req, reply);
      if (!ctx) return done();
      runWithTenantContext(ctx, done);
    })().catch(done);
  });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await registerAuthRoutes(app);
  await registerShipmentRoutes(app);
  await registerTenantRoutes(app);
  await registerTrackingRoutes(app);
  await registerApiKeyRoutes(app);
  await registerWebhookRoutes(app);
  await registerCrmRoutes(app);
  await registerFinanceRoutes(app);
  await registerPaymentsRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerAuditRoutes(app);
  await registerDriverRoutes(app);
  await registerUsersRoutes(app);
  await registerNotificationsRoutes(app);
  await registerReturnsRoutes(app);
  await registerSupportRoutes(app);
  await registerPricingRoutes(app);
  await registerFleetRoutes(app);
  await registerSuperAdminRoutes(app);
  await registerLabelRoutes(app);
  await registerDocumentsRoutes(app);

  await setupTrackingWebsocket(app);

  return app;
}
