import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

// L11 (WP-2.12): Integration Health lists tenant gateways across tenants without any secret or bank field (ACC-L11-2).

vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_1', email: 'ops@fauward.com', name: 'Ops', status: 'ACTIVE', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(['platform.integrations.read']), jit: new Map(), permissions: ['platform.integrations.read'] }))
}));
vi.mock('../../../queues/queues.js', () => ({ analyticsQueue: {}, notificationQueue: {}, outboxQueue: {}, scheduledJobsQueue: {}, webhookQueue: {} }));
vi.mock('../../notifications/notifications.worker.js', () => ({ dlqNotificationQueue: {} }));
vi.mock('../../../queues/outbox.worker.js', () => ({ dlqOutboxQueue: {} }));
vi.mock('../../../queues/webhook.worker.js', () => ({ dlqWebhookQueue: {} }));

describe('console tenant gateway list (WP-2.12)', () => {
  it('ACC-INT-4 ACC-L11-2 GET /api/internal/integrations/tenant-gateways returns state only, filtered by status', async () => {
    const findMany = vi.fn(async (_args: { where: Record<string, unknown> }) => [
      { id: 'gw_1', tenantId: 't_1', tenant: { id: 't_1', name: 'Northwind', slug: 'northwind' }, provider: 'PAYSTACK', mode: 'TEST', enabled: true, publicKey: 'pk_test_visible', secretKeyEncrypted: 'v1:k:iv:cipher', webhookSecretEncrypted: null, encryptionKeyEncrypted: null, config: { merchantEmail: 'pay@northwind.test' }, status: 'FAILED', lastVerifiedAt: null, lastError: 'PAYSTACK returned 401', updatedByUserId: 'u_1', createdAt: new Date(), updatedAt: new Date() }
    ]);
    const app = Fastify();
    app.decorate('prisma', { tenantPaymentGateway: { findMany } } as never);
    const { registerConsoleOperationsRoutes } = await import('./operations.routes.js');
    await registerConsoleOperationsRoutes(app);
    const response = await app.inject({ method: 'GET', url: '/api/internal/integrations/tenant-gateways?status=FAILED' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [{ id: 'gw_1', tenant: { id: 't_1', name: 'Northwind', slug: 'northwind' }, provider: 'PAYSTACK', mode: 'TEST', enabled: true, status: 'FAILED', secretConfigured: true, lastVerifiedAt: null, lastError: 'PAYSTACK returned 401', updatedAt: expect.any(String) }]
    });
    expect(findMany.mock.calls[0][0].where).toEqual({ status: 'FAILED' });
    expect(response.body).not.toMatch(/v1:|pk_test_visible|merchantEmail|Encrypted/);
    await app.close();
  });
});
