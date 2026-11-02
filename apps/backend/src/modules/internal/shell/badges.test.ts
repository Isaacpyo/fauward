import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, type Permission } from '@fauward/internal-rbac';

// GET /api/internal/badges (WP-3.4): one computed value per key, only for keys the caller may read.

const STAFF: Record<string, readonly Permission[]> = {
  pu_root: PERMISSIONS,
  pu_support: ['customer.support.read', 'trust.safety.read']
};

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { headers: Record<string, unknown>; platform?: unknown }) => {
    const id = String(request.headers['x-test-user'] ?? 'pu_root');
    request.platform = { user: { id, email: `${id}@fauward.com`, name: null, status: 'ACTIVE', mfaEnabled: true }, session: { id: `ps_${id}`, mfaVerifiedAt: new Date() }, claims: { sub: id } };
  }
}));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async (_prisma: unknown, user: { id: string }) => ({ staff: null, roles: [], rolePermissions: new Set(STAFF[user.id]), jit: new Map(), permissions: STAFF[user.id] }))
}));
vi.mock('../../../queues/queues.js', () => ({}));
vi.mock('../../notifications/notifications.worker.js', () => ({}));
vi.mock('../../../queues/outbox.worker.js', () => ({}));
vi.mock('../../../queues/webhook.worker.js', () => ({}));

const count = (value: number) => vi.fn(async () => value);

function prisma() {
  return {
    subscription: { findMany: vi.fn(async () => [{ plan: 'STARTER', billingCycle: 'MONTHLY', status: 'ACTIVE', tenant: { id: 't1', status: 'ACTIVE', plan: 'STARTER' } }]) },
    pricingOverride: { findMany: vi.fn(async () => []) },
    customContract: { findFirst: vi.fn(async () => null) },
    currencyRate: { findUnique: vi.fn(async () => null) },
    tenant: { count: vi.fn(async ({ where }: { where: { status?: string } }) => (where.status === 'ACTIVE' ? 40 : where.status === 'TRIALING' ? 6 : where.status === 'SUSPENDED' ? 2 : 0)) },
    supportTicket: { count: count(9) },
    exceptionCase: { count: count(0) },
    refundApproval: { count: count(1) },
    jitAccessRequest: { count: count(2) },
    planChangeRequest: { count: count(0) },
    regionChangeRequest: { count: count(1) },
    tenantAppeal: { count: count(3) },
    dSARRequest: { count: count(4) },
    scheduledJobRun: { count: count(1) },
    integrationProviderStatus: { count: count(1) },
    paymentDispute: { count: count(0) },
    tenantPaymentGateway: { count: count(2) }
  };
}

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function buildApp() {
  const app = Fastify();
  apps.push(app);
  app.decorate('prisma', prisma() as never);
  app.decorate('redis', { hgetall: vi.fn(async () => ({})) } as never);
  const { registerConsoleBadgeRoutes } = await import('./badges.routes.js');
  await registerConsoleBadgeRoutes(app, { queues: () => [] });
  return app;
}

describe('GET /api/internal/badges (WP-3.4)', () => {
  it('ACC-BADGE-1 a ROOT user gets every badge key with a computed value', async () => {
    const { BADGE_KEYS } = await import('../../../services/console-badges.service.js');
    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/api/internal/badges' })).json() as Record<string, { value: unknown; tone: string; asOf: string; reason?: string }>;
    expect(Object.keys(body).sort()).toEqual([...BADGE_KEYS].sort());
    expect(body['tenant-count']).toMatchObject({ value: 46, tone: 'neutral' });
    expect(body['suspended-count']).toMatchObject({ value: 2, tone: 'amber' });
    expect(body['dlq-depth']).toMatchObject({ value: 0, tone: 'green' });
    expect(body.mrr).toMatchObject({ value: { amount: '29.00', currency: 'GBP' } });
    expect(body['open-platform-tickets']).toMatchObject({ value: 9, tone: 'amber' });
    expect(body['pending-approvals']).toMatchObject({ value: 1 + 2 + 0 + 1 + 3 + 4, tone: 'amber' });
    expect(body['open-appeals']).toMatchObject({ value: 3 });
    expect(body['dsar-due-7d']).toMatchObject({ value: 4, tone: 'red' });
    expect(body['failed-jobs-24h']).toMatchObject({ value: 1, tone: 'red' });
    expect(body['integrations-degraded']).toMatchObject({ value: 3, tone: 'red' });
    // No traffic recorded: the health badges say so instead of showing a dash.
    expect(body['p95-latency']).toMatchObject({ value: null, reason: 'No API requests recorded in the last 15 minutes' });
    expect(body['error-rate']).toMatchObject({ value: null, reason: 'No API requests recorded in the last 15 minutes' });
    for (const badge of Object.values(body)) expect(typeof badge.asOf).toBe('string');
  });

  it('ACC-BADGE-1 other roles get only the keys their permissions read; pending-approvals counts only what they may see', async () => {
    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/api/internal/badges', headers: { 'x-test-user': 'pu_support' } })).json() as Record<string, { value: unknown }>;
    expect(Object.keys(body).sort()).toEqual(['open-appeals', 'open-platform-tickets', 'pending-approvals']);
    expect(body['pending-approvals'].value).toBe(3);
  });
});
