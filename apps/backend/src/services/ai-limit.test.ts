import Fastify, { type FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';

// L16 (WP-2.10): staff set a tenant's AI limit from the console → the gateway refuses the next run → the refusal is
// reported once per tenant per day (activity + tenant admins + customer-success staff).

let currentPermissions: Permission[] = [];
const auditMock = vi.hoisted(() => vi.fn(async (_db: unknown, _input: Record<string, unknown>) => ({ id: 'aud_1' })));
const notifyTenantAdmins = vi.hoisted(() => vi.fn(async (_app: unknown, _input: Record<string, unknown>) => ({ inApp: 1, emailsQueued: 1 })));
const notifyStaff = vi.hoisted(() => vi.fn(async (_app: unknown, _input: Record<string, unknown>) => ({ inApp: 1 })));

vi.mock('../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown }) => {
    request.platform = { user: { id: 'pu_1', email: 'ops@fauward.com', name: 'Ops', role: 'PLATFORM_OPERATIONS', mfaEnabled: true }, session: { id: 'ps_1', mfaVerifiedAt: new Date() } };
  }
}));
vi.mock('../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../middleware/require-console-permission.js', () => {
  type ReplyLike = { status: (code: number) => { send: (body: unknown) => unknown } };
  return {
    requireConsolePermission: (permission: Permission) => async (_request: unknown, reply: ReplyLike) => (currentPermissions.includes(permission) ? undefined : reply.status(403).send({ error: 'Forbidden', permission })),
    requireAnyConsolePermission: (permissions: Permission[]) => async (_request: unknown, reply: ReplyLike) =>
      permissions.some((permission) => currentPermissions.includes(permission)) ? undefined : reply.status(403).send({ error: 'Forbidden', permission: permissions[0] }),
    consoleUserHas: async (_request: unknown, permission: Permission) => currentPermissions.includes(permission)
  };
});
vi.mock('./platform-audit.service.js', () => ({ writePlatformAuditLog: auditMock }));
vi.mock('./platform-notifier.service.js', () => ({ notifyTenantAdmins, notifyStaff }));

type LimitRow = {
  id: string;
  tenantId: string;
  monthlyBudgetUsd: Prisma.Decimal | null;
  flashRequestLimit: number | null;
  proRequestLimit: number | null;
  featuresEnabled: string[];
  updatedAt: Date;
  updatedByPlatformUserId: string | null;
  reason: string | null;
};

function month() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function createPrisma() {
  const limits = new Map<string, LimitRow>();
  const activity = new Map<string, Record<string, unknown>>();
  const toDecimal = (value: string | number | null) => (value === null ? null : new Prisma.Decimal(value));
  return {
    limits,
    activity,
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 't_acme' ? { id: 't_acme', name: 'Acme Freight' } : null))
    },
    tenantAiLimit: {
      findUnique: vi.fn(async ({ where }: { where: { tenantId: string } }) => limits.get(where.tenantId) ?? null),
      upsert: vi.fn(async ({ where, create, update }: { where: { tenantId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const previous = limits.get(where.tenantId);
        const data = previous ? update : create;
        const row: LimitRow = {
          id: previous?.id ?? 'ail_1',
          tenantId: where.tenantId,
          monthlyBudgetUsd: toDecimal(data.monthlyBudgetUsd as string | null),
          flashRequestLimit: data.flashRequestLimit as number | null,
          proRequestLimit: data.proRequestLimit as number | null,
          featuresEnabled: data.featuresEnabled as string[],
          updatedAt: new Date(),
          updatedByPlatformUserId: data.updatedByPlatformUserId as string,
          reason: data.reason as string
        };
        limits.set(where.tenantId, row);
        return row;
      })
    },
    // This month the tenant already spent 4.20 USD on 7 standard requests.
    tenantAiUsage: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; month: string } }) =>
        where.tenantId === 't_acme' && where.month === month() ? [{ model: 'deepseek-v4-flash', feature: 'agent_ask', requestCount: 7, costUsd: 4.2 }] : []
      ),
      upsert: vi.fn(async () => ({}))
    },
    aiAgentRun: { create: vi.fn(async () => ({ id: 'run_1' })), update: vi.fn(async () => ({})) },
    platformActivity: {
      findUnique: vi.fn(async ({ where }: { where: { dedupeKey: string } }) => activity.get(where.dedupeKey) ?? null),
      upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Record<string, unknown> }) => {
        if (!activity.has(where.dedupeKey)) activity.set(where.dedupeKey, { id: `act_${activity.size + 1}`, ...create });
        return activity.get(where.dedupeKey)!;
      })
    }
  };
}

const openApps: FastifyInstance[] = [];
let prisma: ReturnType<typeof createPrisma>;
const redis = { publish: vi.fn(async () => 1) };

async function buildApp() {
  const app = Fastify();
  openApps.push(app);
  app.decorate('prisma', prisma as never);
  app.decorate('redis', redis as never);
  const { registerConsoleTenantRoutes } = await import('../modules/internal/platform/tenants.routes.js');
  await registerConsoleTenantRoutes(app);
  const { setAiLimitReachedListener } = await import('../shared/services/llm-gateway.service.js');
  const { reportAiLimitReached } = await import('./ai-limit.service.js');
  setAiLimitReachedListener((event) => reportAiLimitReached(app, event));
  return app;
}

const neverCalledClient = { chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: '{"answer":"ok","confidence":1}' } }], usage: { total_tokens: 10 } })) } } };

async function runAgent() {
  const { LLMGatewayService } = await import('../shared/services/llm-gateway.service.js');
  const gateway = new LLMGatewayService(prisma, neverCalledClient);
  return gateway.run({ task: 'agent_ask', tenantId: 't_acme', input: { question: 'Where is FWD-1?' }, outputSchema: z.object({ answer: z.string(), confidence: z.number() }) });
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  currentPermissions = ['platform.tenants.read', 'platform.tenants.write'];
  prisma = createPrisma();
  auditMock.mockClear();
  notifyTenantAdmins.mockClear();
  notifyStaff.mockClear();
  neverCalledClient.chat.completions.create.mockClear();
});

afterEach(async () => {
  const { setAiLimitReachedListener } = await import('../shared/services/llm-gateway.service.js');
  setAiLimitReachedListener(null);
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('L16 AI limits (WP-2.10)', () => {
  it('ACC-L16-1 a monthly budget below current spend makes the next agent run return the gateway limit error', async () => {
    const app = await buildApp();
    const before = await runAgent();
    expect(before.result.answer).toBe('ok');

    const set = await app.inject({
      method: 'PUT',
      url: '/api/internal/tenants/t_acme/ai-limit',
      payload: { monthlyBudgetUsd: '4.00', flashRequestLimit: null, proRequestLimit: null, featuresEnabled: [], reason: 'Budget agreed with the customer' }
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toMatchObject({ limit: { monthlyBudgetUsd: '4.00', flashRequestLimit: null, featuresEnabled: [], reason: 'Budget agreed with the customer', updatedByPlatformUserId: 'pu_1' } });
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'TENANT_AI_LIMIT_UPDATED', targetTenantId: 't_acme', reason: 'Budget agreed with the customer' }));
    expect([...prisma.activity.values()]).toEqual([expect.objectContaining({ service: 'customer.360', type: 'ai.limit_changed', tenantId: 't_acme', actorType: 'STAFF' })]);
    expect(notifyTenantAdmins).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 't_acme', event: 'ai.limit_changed', email: expect.objectContaining({ template: 'ai_limit_changed' }) }));

    neverCalledClient.chat.completions.create.mockClear();
    await expect(runAgent()).rejects.toMatchObject({ statusCode: 402, payload: { error: 'AI_BUDGET_EXCEEDED' } });
    expect(neverCalledClient.chat.completions.create).not.toHaveBeenCalled();
    await flush();
    const reached = [...prisma.activity.values()].filter((row) => row.type === 'ai.limit_reached');
    expect(reached).toEqual([expect.objectContaining({ service: 'customer.360', tenantId: 't_acme', actorType: 'SYSTEM', severity: 'ATTENTION' })]);
    expect(notifyTenantAdmins).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ event: 'ai.limit_reached', email: expect.objectContaining({ template: 'ai_limit_reached' }) }));
    expect(notifyStaff).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ permission: 'customer.success.read', event: 'ai.limit_reached', tenantId: 't_acme' }));

    // Deduped per tenant per day: a second refusal neither adds a row nor notifies again.
    await expect(runAgent()).rejects.toMatchObject({ statusCode: 402 });
    await flush();
    expect([...prisma.activity.values()].filter((row) => row.type === 'ai.limit_reached')).toHaveLength(1);
    expect(notifyStaff).toHaveBeenCalledTimes(1);
  });

  it('a request limit at the current count refuses with AI_LIMIT_EXCEEDED; feature keys are validated', async () => {
    const app = await buildApp();
    const set = await app.inject({
      method: 'PUT',
      url: '/api/internal/tenants/t_acme/ai-limit',
      payload: { monthlyBudgetUsd: null, flashRequestLimit: 7, proRequestLimit: 100, featuresEnabled: ['agent_ask', 'agent_sweep'], reason: 'Request cap for the trial' }
    });
    expect(set.statusCode).toBe(200);
    await expect(runAgent()).rejects.toMatchObject({ statusCode: 429, payload: { error: 'AI_LIMIT_EXCEEDED', limit: 'flashRequestLimit' } });

    const unknown = await app.inject({ method: 'PUT', url: '/api/internal/tenants/t_acme/ai-limit', payload: { monthlyBudgetUsd: '1.234', flashRequestLimit: null, proRequestLimit: null, featuresEnabled: [], reason: 'Request cap for the trial' } });
    expect(unknown.statusCode).toBe(400);
    const badFeature = await app.inject({ method: 'PUT', url: '/api/internal/tenants/t_acme/ai-limit', payload: { monthlyBudgetUsd: null, flashRequestLimit: null, proRequestLimit: null, featuresEnabled: ['mine_bitcoin'], reason: 'Request cap for the trial' } });
    expect(badFeature.statusCode).toBe(400);
  });

  it('setting the limit is dangerous: platform.tenants.write and a reason are required', async () => {
    const app = await buildApp();
    const payload = { monthlyBudgetUsd: '10', flashRequestLimit: null, proRequestLimit: null, featuresEnabled: [] };
    expect((await app.inject({ method: 'PUT', url: '/api/internal/tenants/t_acme/ai-limit', payload })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/internal/tenants/t_missing/ai-limit', payload: { ...payload, reason: 'Budget agreed with the customer' } })).statusCode).toBe(404);
    currentPermissions = ['platform.tenants.read'];
    expect((await app.inject({ method: 'PUT', url: '/api/internal/tenants/t_acme/ai-limit', payload: { ...payload, reason: 'Budget agreed with the customer' } })).statusCode).toBe(403);
    expect(prisma.limits.size).toBe(0);
  });
});
