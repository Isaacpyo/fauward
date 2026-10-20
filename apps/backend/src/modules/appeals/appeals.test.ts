import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/middleware/authenticate.js', () => ({ authenticate: async () => undefined }));

const openApps: FastifyInstance[] = [];

async function buildApp(tenant: Record<string, unknown>, data: { active?: Record<string, unknown> | null; appeal?: Record<string, unknown> | null }) {
  const app = Fastify();
  openApps.push(app);
  const prisma = {
    suspensionRecord: { findFirst: vi.fn(async () => data.active ?? null) },
    tenantAppeal: { findFirst: vi.fn(async () => data.appeal ?? null), create: vi.fn() },
    platformActivity: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'act_1', ...create })) },
    staffUser: { findMany: vi.fn(async () => []) }
  };
  app.decorate('prisma', prisma as never);
  app.decorate('redis', { publish: vi.fn(async () => 1) } as never);
  app.addHook('onRequest', async (request) => {
    request.tenant = tenant as never;
  });
  const { registerAppealRoutes } = await import('./appeals.routes.js');
  await registerAppealRoutes(app);
  return { app, prisma };
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('tenant suspension state (D3)', () => {
  it('GET /tenants/me/suspension returns category, public reason, since and appeal state, never the internal reason', async () => {
    const since = new Date('2026-10-18T09:00:00Z');
    const { app } = await buildApp(
      { id: 't_1', status: 'SUSPENDED', suspendedAt: since, suspensionReason: 'Your workspace sent bulk unsolicited messages.' },
      {
        active: { id: 'susp_1', category: 'AUP', publicReason: 'Your workspace sent bulk unsolicited messages.', reason: 'INTERNAL: reported by three carriers', createdAt: since },
        appeal: { id: 'appeal_1', suspensionId: 'susp_1', status: 'REJECTED', reviewNote: 'Evidence did not show consent', createdAt: since, updatedAt: new Date('2026-10-18T11:00:00Z') }
      }
    );
    const response = await app.inject({ method: 'GET', url: '/api/v1/tenants/me/suspension' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      suspended: true,
      closed: false,
      category: 'AUP',
      publicReason: 'Your workspace sent bulk unsolicited messages.',
      since: since.toISOString(),
      appealable: true,
      appeal: { id: 'appeal_1', status: 'REJECTED', createdAt: since.toISOString(), decidedAt: '2026-10-18T11:00:00.000Z', resolution: 'Evidence did not show consent', question: null, canReply: false, reply: null }
    });
    expect(response.body).not.toContain('INTERNAL');
  });

  it('a pending appeal makes the suspension not appealable again', async () => {
    const { app } = await buildApp({ id: 't_1', status: 'SUSPENDED', suspendedAt: new Date() }, { active: { id: 'susp_1', category: 'BILLING', publicReason: 'p', createdAt: new Date() }, appeal: { id: 'a', suspensionId: 'susp_1', status: 'PENDING', reviewNote: null, createdAt: new Date(), updatedAt: new Date() } });
    expect((await app.inject({ method: 'GET', url: '/api/v1/tenants/me/suspension' })).json()).toMatchObject({ appealable: false, appeal: { status: 'PENDING', decidedAt: null } });
  });

  it('a closed tenant cannot appeal (409 TENANT_CLOSED)', async () => {
    const { app, prisma } = await buildApp({ id: 't_1', status: 'CANCELLED' }, {});
    const response = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/suspension-appeal', payload: { reason: 'x'.repeat(60), contactEmail: 'owner@tenant.test' } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'TENANT_CLOSED' });
    expect(prisma.tenantAppeal.create).not.toHaveBeenCalled();
  });

  it('appeal creation links the latest active suspension server-side', async () => {
    const { app, prisma } = await buildApp({ id: 't_1', status: 'SUSPENDED' }, { active: { id: 'susp_latest' }, appeal: null });
    prisma.tenantAppeal.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'appeal_new', ...data }));
    const response = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/suspension-appeal', payload: { reason: 'x'.repeat(60), contactEmail: 'owner@tenant.test', suspensionId: 'client_supplied' } });
    expect(response.statusCode).toBe(201);
    expect(prisma.tenantAppeal.create).toHaveBeenCalledWith({ data: expect.objectContaining({ suspensionId: 'susp_latest' }) });
  });
});
