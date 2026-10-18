import Fastify, { type RouteOptions } from 'fastify';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFERRED_PERMISSIONS, type Permission } from '@fauward/internal-rbac';

// Architecture §4 rbac-matrix gate, run against the routes the console actually registers (registerConsoleRoutes plus
// the two tenant modules that also own /api/internal endpoints).

// Stand-ins for Prisma/Redis: any property chain resolves to an async no-op. `getter`/`setter`/`then` stay undefined so
// Fastify's decorate() and await do not mistake the proxy for an accessor descriptor or a thenable.
const inert = (): unknown =>
  new Proxy(async () => null, { get: (_target, key) => (key === 'then' || key === 'getter' || key === 'setter' ? undefined : inert()) });

vi.mock('../../queues/queues.js', () => {
  const queue = { add: vi.fn(), getJobCounts: vi.fn() };
  return { bullmqConnection: {}, notificationQueue: queue, webhookQueue: queue, outboxQueue: queue, pdfQueue: queue, analyticsQueue: queue, scheduledJobsQueue: queue, routeOptimizationQueue: queue };
});
vi.mock('../../modules/notifications/notifications.worker.js', () => ({ dlqNotificationQueue: {} }));
vi.mock('../../queues/outbox.worker.js', () => ({ dlqOutboxQueue: {} }));
vi.mock('../../queues/webhook.worker.js', () => ({ dlqWebhookQueue: {} }));

type CapturedRoute = { method: string; url: string; preHandler: unknown[] };

/** Routes reachable without a console permission guard, each for a stated reason (architecture §4). */
const PUBLIC_ROUTES = new Set([
  // console auth: login/refresh are pre-session; the rest are session-scoped auth endpoints
  'POST /api/internal/auth/login',
  'POST /api/internal/auth/refresh',
  'POST /api/internal/auth/logout',
  'POST /api/internal/auth/mfa/enroll/start',
  'POST /api/internal/auth/mfa/enroll/confirm',
  'POST /api/internal/auth/mfa/verify',
  // vendor webhooks, verified by HMAC signature inside the handler
  'POST /api/internal/incidents/webhooks/pagerduty',
  'POST /api/internal/kyc/webhooks/persona',
  'POST /api/internal/kyc/webhooks/complyadvantage',
  'POST /api/internal/contracts/webhooks/docusign'
]);
/** Session-only routes: every staff member may call them; output is the caller's own or filtered by their permissions. */
const SESSION_ONLY_ROUTES = new Set([
  'GET /api/internal/auth/me',
  'GET /api/internal/notifications/staff',
  'POST /api/internal/notifications/staff/read-all',
  'POST /api/internal/notifications/staff/:id/read',
  'GET /api/internal/metrics/overview'
]);
/** Machine routes for the status dashboard / Python services, guarded by MONITORING_API_KEY (S8). */
const MACHINE_ROUTES = new Set([
  'GET /api/internal/metrics/queues',
  'GET /api/internal/metrics/business-health',
  'GET /api/internal/metrics/custom-domains',
  'GET /api/internal/metrics/relay-health'
]);
/**
 * Preview services that still have routes using deferred permissions until WP-4.0b removes them (C20: commissions,
 * partners and pricing stay preview with livePhase null until then).
 */
const DEFERRED_PERMISSION_ROUTE_ALLOWLIST_UNTIL_WP_4_0B = /^(GET|POST) \/api\/internal\/(commissions|partners|pricing)\b/;

let routes: CapturedRoute[] = [];
let freshMfa: unknown;
let auth: unknown;
let csrf: unknown;

function guardPermissions(route: CapturedRoute): Permission[] {
  return route.preHandler.flatMap((handler) => (handler as { consolePermissions?: readonly Permission[] }).consolePermissions ?? []);
}
const key = (route: Pick<CapturedRoute, 'method' | 'url'>) => `${route.method} ${route.url}`;

beforeAll(async () => {
  process.env.MONITORING_API_KEY ??= 'rbac-matrix-test-key';
  const app = Fastify();
  app.addHook('onRoute', (route: RouteOptions) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const preHandler = Array.isArray(route.preHandler) ? route.preHandler : route.preHandler ? [route.preHandler] : [];
    for (const method of methods) {
      if (method === 'HEAD' || !route.url.startsWith('/api/internal')) continue;
      routes.push({ method, url: route.url, preHandler });
    }
  });
  app.decorate('prisma', inert() as never);
  app.decorate('redis', inert() as never);
  const { registerConsoleRoutes } = await import('../../modules/internal/register.js');
  const { registerAnnouncementRoutes } = await import('../../modules/announcements/announcements.routes.js');
  const { registerOnboardingRoutes } = await import('../../modules/onboarding/onboarding.routes.js');
  await registerConsoleRoutes(app);
  await registerAnnouncementRoutes(app);
  await registerOnboardingRoutes(app);
  await app.ready();
  await app.close();
  freshMfa = (await import('../../middleware/require-fresh-platform-mfa.js')).requireFreshMfa;
  auth = (await import('../../middleware/authenticate-platform-session.js')).authenticatePlatformSession;
  csrf = (await import('../../middleware/require-platform-csrf.js')).requirePlatformCsrf;
});

afterAll(() => {
  routes = [];
});

describe('console RBAC matrix (architecture §4)', () => {
  it('ACC-RBAC-4 every console route has a permission guard or is in an explicit allowlist', () => {
    const unguarded = routes.filter((route) => guardPermissions(route).length === 0).map(key);
    const unexplained = unguarded.filter((route) => !PUBLIC_ROUTES.has(route) && !SESSION_ONLY_ROUTES.has(route) && !MACHINE_ROUTES.has(route));
    expect(unexplained).toEqual([]);
    // Allowlists only name routes that exist.
    const registered = new Set(routes.map(key));
    expect([...PUBLIC_ROUTES, ...SESSION_ONLY_ROUTES, ...MACHINE_ROUTES].filter((route) => !registered.has(route))).toEqual([]);
  });

  it('ACC-RBAC-4 permission-guarded and session-only routes authenticate the console session first', () => {
    const missing = routes
      .filter((route) => guardPermissions(route).length > 0 || SESSION_ONLY_ROUTES.has(key(route)))
      .filter((route) => route.preHandler[0] !== auth)
      .map(key);
    expect(missing).toEqual([]);
  });

  it('ACC-RBAC-4 every dangerous route has CSRF, a permission, fresh MFA and a reason guard', async () => {
    const { DANGEROUS_ROUTES } = await import('../../modules/internal/dangerous-routes.js');
    for (const dangerous of DANGEROUS_ROUTES) {
      const route = routes.find((item) => item.method === dangerous.method && item.url === dangerous.url);
      expect(route, `${dangerous.method} ${dangerous.url} registered`).toBeDefined();
      expect(route!.preHandler, `${dangerous.url} CSRF`).toContain(csrf);
      expect(guardPermissions(route!).length, `${dangerous.url} permission`).toBeGreaterThan(0);
      expect(route!.preHandler, `${dangerous.url} fresh MFA`).toContain(freshMfa);
      expect(route!.preHandler.some((handler) => (handler as { reasonGuard?: boolean }).reasonGuard === true), `${dangerous.url} reason`).toBe(true);
    }
  });

  it('mutating console routes are never guarded only by a read permission and always check CSRF', () => {
    const mutating = routes.filter((route) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method) && !PUBLIC_ROUTES.has(key(route)) && !MACHINE_ROUTES.has(key(route)));
    expect(mutating.filter((route) => guardPermissions(route).length > 0 && guardPermissions(route).every((permission) => permission.endsWith('.read'))).map(key)).toEqual([]);
    expect(mutating.filter((route) => !route.preHandler.includes(csrf)).map(key)).toEqual([]);
  });

  it('no console route uses a deferred permission (D1)', () => {
    const deferred = new Set<string>(DEFERRED_PERMISSIONS);
    const offenders = routes
      .filter((route) => guardPermissions(route).some((permission) => deferred.has(permission)))
      .map(key)
      .filter((route) => !DEFERRED_PERMISSION_ROUTE_ALLOWLIST_UNTIL_WP_4_0B.test(route));
    expect(offenders).toEqual([]);
  });

  it('route-index.ts lists exactly the registered console routes', async () => {
    const { CONSOLE_ROUTE_INDEX } = await import('../../modules/internal/route-index.js');
    expect([...CONSOLE_ROUTE_INDEX].sort()).toEqual([...new Set(routes.map(key))].sort());
  });
});

describe('one console namespace (D2)', () => {
  it('ACC-RBAC-3 no /api/v1/platform route remains outside tracking and control-tower (moved in WP-2.11)', async () => {
    const root = resolve(process.cwd(), 'src');
    const offenders: string[] = [];
    async function scan(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          await scan(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
        const source = await readFile(full, 'utf8');
        for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\(\s*['`](\/api\/v1\/platform[^'`]*)/g)) {
          const url = match[2];
          if (url.startsWith('/api/v1/platform/tracking') || url.startsWith('/api/v1/platform/control-tower') || /^\/api\/v1\/platform\/tenants\/:tenantId\/shipments\/:shipmentId\/tracking/.test(url)) continue;
          offenders.push(`${full}: ${url}`);
        }
      }
    }
    await scan(root);
    expect(offenders).toEqual([]);
  });
});
