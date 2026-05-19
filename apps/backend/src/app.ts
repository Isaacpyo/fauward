import Fastify from 'fastify';
import { Readable } from 'node:stream';
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
import { registerRealtimeTrackingRoutes } from './modules/tracking/tracking.realtime.routes.js';
import { registerPaymentsRoutes } from './modules/payments/payments.routes.js';
import { registerSuperAdminRoutes } from './modules/super-admin/super-admin.routes.js';
import { registerPlatformRoutes } from './modules/platform/platform.routes.js';
import { registerInternalIamRoutes } from './modules/internal/iam.routes.js';
import { registerInternalAuditRoutes } from './modules/internal/audit.routes.js';
import { registerInternalBillingRoutes } from './modules/internal/billing.routes.js';
import { registerInternalCustomer360Routes } from './modules/internal/customer360.routes.js';
import { registerInternalConsolePhaseRoutes } from './modules/internal/console-phases.routes.js';
import { auditMiddleware } from '@fauward/internal-audit';
import type { PlatformAuditClient } from '@fauward/internal-audit';
import { registerFieldRoutes } from './modules/field/field.routes.js';
import { registerRelayRoutes } from './modules/relay/relay.routes.js';
import { enforceTenantStatus } from './middleware/enforce-tenant-status.js';
import { setupTrackingWebsocket } from './modules/tracking/tracking.websocket.js';
import { registerRoutingRoutes } from './modules/routing/routing.routes.js';
import { startRouteOptimizationWorker } from './queues/route-optimization.worker.js';
import { registerMonitoringRoutes } from './modules/internal/monitoring.routes.js';
import { registerAnnouncementRoutes } from './modules/announcements/announcements.routes.js';
import { registerDsarRoutes } from './modules/dsar/dsar.routes.js';
import { registerAppealRoutes } from './modules/appeals/appeals.routes.js';
import { registerOnboardingRoutes } from './modules/onboarding/onboarding.routes.js';
import { registerTenantHealthRoutes } from './modules/tenants/health.routes.js';

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

  app.addHook('preParsing', (request, _reply, payload, done) => {
    if (!request.url.includes('/webhooks/')) {
      done(null, payload);
      return;
    }

    const chunks: Buffer[] = [];
    payload.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    payload.on('error', done);
    payload.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      request.rawBody = rawBody;
      done(null, Readable.from([rawBody]));
    });
  });

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
      statusCode: context.ban ? 403 : 429,
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
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'DELETE' || !request.tenant?.id) return;
    const hold = await app.prisma.legalHold.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ tenantId: request.tenant.id }, { tenantId: null }]
      }
    });
    if (hold) {
      return reply.status(409).send({ error: 'LEGAL_HOLD_ACTIVE', tenantId: request.tenant.id });
    }
  });

  // ── Health / readiness / version endpoints ─────────────────────────────
  app.get('/live', async () => ({ status: 'ok' }));

  app.get('/ready', async (_req, reply) => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    try {
      const t = Date.now();
      await app.prisma.$queryRaw`SELECT 1`;
      checks.postgres = { status: 'up', latencyMs: Date.now() - t };
    } catch {
      checks.postgres = { status: 'down' };
    }

    try {
      const t = Date.now();
      await app.redis.ping();
      checks.redis = { status: 'up', latencyMs: Date.now() - t };
    } catch {
      checks.redis = { status: 'down' };
    }

    const allUp = Object.values(checks).every(c => c.status === 'up');
    return reply.status(allUp ? 200 : 503).send({
      status: allUp ? 'up' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health', async (_req, reply) => {
    const t0 = Date.now();
    const checks: Record<string, { status: string; latencyMs: number }> = {};

    await Promise.allSettled([
      (async () => {
        const t = Date.now();
        try { await app.prisma.$queryRaw`SELECT 1`; checks.postgres = { status: 'up', latencyMs: Date.now() - t }; }
        catch { checks.postgres = { status: 'down', latencyMs: Date.now() - t }; }
      })(),
      (async () => {
        const t = Date.now();
        try { await app.redis.ping(); checks.redis = { status: 'up', latencyMs: Date.now() - t }; }
        catch { checks.redis = { status: 'down', latencyMs: Date.now() - t }; }
      })(),
    ]);

    const allUp = Object.values(checks).every(c => c.status === 'up');
    return reply.status(allUp ? 200 : 207).send({
      status:      allUp ? 'up' : 'degraded',
      service:     'main-api',
      environment: config.nodeEnv,
      timestamp:   new Date().toISOString(),
      latencyMs:   Date.now() - t0,
      dependencies: checks,
    });
  });

  app.get('/version', async () => ({
    service:     'main-api',
    version:     process.env.APP_VERSION  ?? '0.0.0',
    commit:      process.env.GIT_COMMIT   ?? 'unknown',
    branch:      process.env.GIT_BRANCH   ?? 'unknown',
    buildTime:   process.env.BUILD_TIME   ?? 'unknown',
    environment: config.nodeEnv,
  }));

  await registerAuthRoutes(app);
  await registerShipmentRoutes(app);
  await registerTenantRoutes(app);
  await registerAnnouncementRoutes(app);
  await registerDsarRoutes(app);
  await registerAppealRoutes(app);
  await registerOnboardingRoutes(app);
  await registerTenantHealthRoutes(app);
  await registerPublicTrackingRoutes(app);
  await registerTenantTrackingRoutes(app);
  await registerPlatformTrackingRoutes(app);
  await registerGoTrackingRoutes(app);
  await registerRealtimeTrackingRoutes(app);
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
  await registerInternalBillingRoutes(app);
  await registerInternalCustomer360Routes(app);
  await registerInternalConsolePhaseRoutes(app);
  await registerSuperAdminRoutes(app);
  await registerLabelRoutes(app);
  await registerDocumentsRoutes(app);

  await registerRoutingRoutes(app);
  await registerMonitoringRoutes(app);

  await setupTrackingWebsocket(app);
  startStuckShipmentDetector(app);
  startRouteOptimizationWorker();

  return app;
}
