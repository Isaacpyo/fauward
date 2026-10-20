import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The route module pulls in handler builders that touch BullMQ queues at import time;
// mocking them keeps the test harness lean and avoids Redis.
vi.mock('./agent.handlers.impl.js', () => ({
  buildToolHandlers: vi.fn(() => mockHandlers)
}));

const mockGatewayRun = vi.fn();
vi.mock('../../shared/services/llm-gateway.service.js', () => ({
  LLMGatewayService: vi.fn().mockImplementation(() => ({
    run: mockGatewayRun
  }))
}));

import { registerAgentAskRoute } from './agent.ask.js';

const mockHandlers: Record<string, ReturnType<typeof vi.fn>> = {
  get_failed_shipments_count: vi.fn(),
  get_sla_breach_rate: vi.fn(),
  get_driver_performance: vi.fn(),
  get_delay_reasons: vi.fn(),
  get_shipments_by_status: vi.fn(),
  get_weekly_operations_summary: vi.fn(),
  get_carrier_performance: vi.fn(),
  get_shipment_details: vi.fn(),
  get_available_drivers: vi.fn(),
  // mutating tools — must never be invokable from /ask
  assign_shipment: vi.fn(),
  reroute_shipment: vi.fn(),
  send_customer_notification: vi.fn(),
  flag_sla_risk: vi.fn(),
  get_carrier_rates: vi.fn()
};

interface MsgRow {
  id: string;
  tenantId: string;
  conversationId: string;
  role: string;
  content: string;
  status?: string | null;
  toolsUsed?: unknown;
  proposedActionIds?: string[];
  createdAt: number; // monotonic clock for deterministic ordering
}
interface ConvRow {
  id: string;
  tenantId: string;
  createdBy: string;
  title: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

function buildApp(tenantOverrides: Record<string, unknown> = {}, userOverrides: Record<string, unknown> = {}) {
  const app = Fastify();
  app.register(import('@fastify/sensible'));

  const agentActionRows: unknown[] = [];
  const conversations = new Map<string, ConvRow>();
  const messages: MsgRow[] = [];
  let seq = 0;
  let clock = 0;

  const prisma = {
    // requireFeature reads entitlements (WP-1.4): no plan or feature overrides for these tenants.
    tenantPlanOverride: { findFirst: vi.fn(async () => null) },
    tenantFeatureOverride: { findMany: vi.fn(async () => []) },
    agentAction: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        agentActionRows.push(data);
        return data;
      }),
      count: vi.fn(async () => agentActionRows.length)
    },
    agentConversation: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `conv-${++seq}`;
        const row: ConvRow = {
          id,
          tenantId: data.tenantId as string,
          createdBy: data.createdBy as string,
          title: data.title as string,
          archived: false,
          createdAt: ++clock,
          updatedAt: ++clock
        };
        conversations.set(id, row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const row = conversations.get(where.id);
        return row && row.tenantId === where.tenantId ? row : null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
          const row = conversations.get(where.id);
          if (!row) throw new Error('conversation not found');
          if (data.messages?.create) {
            const m = data.messages.create;
            messages.push({
              id: `msg-${++seq}`,
              tenantId: m.tenantId,
              conversationId: where.id,
              role: m.role,
              content: m.content,
              status: m.status ?? null,
              toolsUsed: m.toolsUsed,
              proposedActionIds: m.proposedActionIds ?? [],
              createdAt: ++clock
            });
          }
          if (data.title !== undefined) row.title = data.title;
          if (data.archived !== undefined) row.archived = data.archived;
          row.updatedAt = ++clock;
          return row;
        }
      )
    },
    agentMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
        const m: MsgRow = {
          id: `msg-${++seq}`,
          tenantId: data.tenantId,
          conversationId: data.conversationId,
          role: data.role,
          content: data.content,
          status: data.status ?? null,
          toolsUsed: data.toolsUsed,
          proposedActionIds: data.proposedActionIds ?? [],
          createdAt: ++clock
        };
        messages.push(m);
        return m;
      }),
      findMany: vi.fn(
        async ({
          where,
          orderBy,
          take
        }: {
          where: { tenantId: string; conversationId: string };
          orderBy?: { createdAt: 'asc' | 'desc' };
          take?: number;
        }) => {
          let rows = messages.filter(
            (m) => m.tenantId === where.tenantId && m.conversationId === where.conversationId
          );
          rows = rows.sort((a, b) => a.createdAt - b.createdAt);
          if (orderBy?.createdAt === 'desc') rows = rows.reverse();
          if (take) rows = rows.slice(0, take);
          return rows;
        }
      )
    }
  };

  // Test helper: seed prior messages straight into the store (bypasses the LLM round-trip).
  function seedMessages(conversationId: string, tenantId: string, count: number) {
    for (let i = 0; i < count; i++) {
      messages.push({
        id: `seed-${++seq}`,
        tenantId,
        conversationId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `prior message ${i}`,
        status: i % 2 === 0 ? null : 'answered',
        createdAt: ++clock
      });
    }
  }

  (app as unknown as { decorate: (k: string, v: unknown) => void }).decorate('prisma', prisma);
  (app as unknown as { decorate: (k: string, v: unknown) => void }).decorate(
    'authenticate',
    async (req: { user?: unknown }) => {
      req.user = req.user ?? {
        sub: 'user-1',
        role: 'TENANT_ADMIN',
        tenantId: 'tenant-1',
        ...userOverrides
      };
    }
  );
  app.addHook('onRequest', (req, _reply, done) => {
    (req as unknown as { tenant: unknown }).tenant = {
      id: 'tenant-1',
      slug: 'acme',
      plan: 'PRO',
      maxStaff: 15,
      maxShipmentsPm: 2000,
      maxOrganisations: -1,
      ...tenantOverrides
    };
    done();
  });

  return { app, prisma, agentActionRows, conversations, messages, seedMessages };
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  while (apps.length) {
    const ctx = apps.pop();
    if (ctx) await ctx.app.close();
  }
  mockGatewayRun.mockReset();
  for (const h of Object.values(mockHandlers)) h.mockReset();
});

beforeEach(() => {
  for (const h of Object.values(mockHandlers)) h.mockReset();
});

describe('POST /api/v1/agent/ask', () => {
  it('answers a tool-mapped question with real tenant-scoped data', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    mockHandlers.get_failed_shipments_count.mockResolvedValueOnce({ count: 12, dateFrom: '2026-05-19', dateTo: '2026-05-26' });

    // Round 1: model picks the tool.
    mockGatewayRun.mockResolvedValueOnce({
      result: {
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'get_failed_shipments_count', arguments: JSON.stringify({ tenantId: 'attacker-tenant', dateFrom: '2026-05-19', dateTo: '2026-05-26' }) }
          }
        ]
      },
      confidence: 0,
      model: 'deepseek-v4-flash',
      tokensUsed: 12,
      latencyMs: 5,
      degraded: false,
      runId: 'run-1'
    });
    // Round 2: model phrases the answer.
    mockGatewayRun.mockResolvedValueOnce({
      result: { answer: 'You had 12 failed shipments in the last 7 days.' },
      confidence: 0,
      model: 'deepseek-v4-flash',
      tokensUsed: 18,
      latencyMs: 4,
      degraded: false,
      runId: 'run-2'
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/ask',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: { question: 'How many shipments failed this week?' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('answered');
    expect(body.answer).toContain('12');
    expect(body.toolsUsed).toHaveLength(1);
    expect(body.toolsUsed[0].name).toBe('get_failed_shipments_count');

    // tenantId in the handler call MUST come from auth context, not from the model's args.
    expect(mockHandlers.get_failed_shipments_count).toHaveBeenCalledTimes(1);
    const handlerArgs = mockHandlers.get_failed_shipments_count.mock.calls[0][0];
    expect(handlerArgs.tenantId).toBe('tenant-1');
    const handlerCtx = mockHandlers.get_failed_shipments_count.mock.calls[0][1];
    expect(handlerCtx.tenantId).toBe('tenant-1');
  });

  it('returns cannot_answer when the model proposes no tool call', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    mockGatewayRun.mockResolvedValueOnce({
      result: { content: null, tool_calls: [] },
      confidence: 0,
      model: 'deepseek-v4-flash',
      tokensUsed: 5,
      latencyMs: 2,
      degraded: false,
      runId: 'run-1'
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/ask',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: { question: 'What is the meaning of life?' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('cannot_answer');
    expect(body.answer).toMatch(/can't answer/i);
    expect(body.toolsUsed).toEqual([]);
    // No second LLM round when we couldn't pick a tool.
    expect(mockGatewayRun).toHaveBeenCalledTimes(1);
  });

  it('refuses any non-read-only tool the model tries to call, never invokes handler', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    mockGatewayRun.mockResolvedValueOnce({
      result: {
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'assign_shipment', arguments: JSON.stringify({ shipmentId: 's', driverId: 'd', reason: 'r' }) }
          }
        ]
      },
      confidence: 0,
      model: 'deepseek-v4-flash',
      tokensUsed: 5,
      latencyMs: 2,
      degraded: false,
      runId: 'run-1'
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/ask',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: { question: 'Assign ship-1 to driver-1' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('cannot_answer');
    expect(mockHandlers.assign_shipment).not.toHaveBeenCalled();
    expect(ctx.agentActionRows).toEqual([]); // chat never creates AgentAction rows
  });

  it('returns status=error gracefully when the LLM gateway throws (no 500)', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    mockGatewayRun.mockRejectedValueOnce(new Error('upstream timeout'));

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/ask',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: { question: 'How many shipments failed this week?' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('error');
    expect(body.toolsUsed).toEqual([]);
  });

  it('rejects with 403 when the tenant plan does not include the agent feature', async () => {
    const ctx = buildApp({ plan: 'STARTER' });
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/ask',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: { question: 'How many shipments failed this week?' }
    });

    expect(res.statusCode).toBe(403);
    expect(mockGatewayRun).not.toHaveBeenCalled();
  });

  it('rejects empty / overlong questions with 400', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    const empty = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/ask',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: { question: '   ' }
    });
    expect(empty.statusCode).toBe(400);

    const tooLong = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/agent/ask',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: { question: 'x'.repeat(501) }
    });
    expect(tooLong.statusCode).toBe(400);
    expect(mockGatewayRun).not.toHaveBeenCalled();
  });
});

// Helper: queue a full answered exchange (round 1 tool call + round 2 phrasing).
function mockAnsweredExchange(answer: string) {
  mockHandlers.get_failed_shipments_count.mockResolvedValueOnce({ count: 1 });
  mockGatewayRun.mockResolvedValueOnce({
    result: {
      content: null,
      tool_calls: [
        { id: 'c', type: 'function', function: { name: 'get_failed_shipments_count', arguments: '{}' } }
      ]
    },
    confidence: 0,
    model: 'deepseek-v4-flash',
    tokensUsed: 1,
    latencyMs: 1,
    degraded: false,
    runId: 'r1'
  });
  mockGatewayRun.mockResolvedValueOnce({
    result: { answer },
    confidence: 0,
    model: 'deepseek-v4-flash',
    tokensUsed: 1,
    latencyMs: 1,
    degraded: false,
    runId: 'r2'
  });
}

async function ask(app: ReturnType<typeof buildApp>['app'], payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/agent/ask',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    payload
  });
}

describe('POST /api/v1/agent/ask — conversation persistence', () => {
  it('creates a conversation, persists user + assistant messages, and returns conversationId', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    mockAnsweredExchange('You had 1 failed shipment.');
    const res = await ask(ctx.app, { question: 'How many failed this week?' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.conversationId).toBeTruthy();
    expect(body.status).toBe('answered');

    // One thread, two messages (user then assistant), both tenant-scoped.
    expect(ctx.conversations.size).toBe(1);
    const persisted = ctx.messages.filter((m) => m.conversationId === body.conversationId);
    expect(persisted.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(persisted.every((m) => m.tenantId === 'tenant-1')).toBe(true);
    expect(persisted[0].content).toBe('How many failed this week?');
    expect(persisted[1].status).toBe('answered');
  });

  it('reuses an existing conversationId and replays prior turns as history', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    mockAnsweredExchange('First answer: 1 failed.');
    const first = await ask(ctx.app, { question: 'How many failed this week?' });
    const conversationId = JSON.parse(first.payload).conversationId;

    mockAnsweredExchange('Second answer: ACME Logistics caused them.');
    await ask(ctx.app, { question: 'Which carrier caused them?', conversationId });

    // The 2nd exchange's round-1 call (overall gateway call index 2) must carry prior history.
    const round1OfSecond = mockGatewayRun.mock.calls[2][0] as { input: { history?: Array<{ role: string; content: string }> } };
    expect(round1OfSecond.input.history).toBeDefined();
    const contents = round1OfSecond.input.history!.map((h) => h.content);
    expect(contents).toContain('How many failed this week?');
    expect(contents.some((c) => c.startsWith('First answer'))).toBe(true);
  });

  it('returns 404 for a conversationId belonging to another tenant', async () => {
    const other = buildApp(); // seed a conversation under a different store/tenant conceptually
    const ctx = buildApp();
    apps.push(other, ctx);
    await registerAgentAskRoute(ctx.app);

    const res = await ask(ctx.app, { question: 'Hello?', conversationId: 'conv-does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(mockGatewayRun).not.toHaveBeenCalled();
  });

  it('caps replayed history at HISTORY_LIMIT (12)', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    mockAnsweredExchange('seed answer');
    const first = await ask(ctx.app, { question: 'opening question' });
    const conversationId = JSON.parse(first.payload).conversationId;

    // 16+ prior messages now exist; loadHistory must take only the last 12.
    ctx.seedMessages(conversationId, 'tenant-1', 14);

    mockAnsweredExchange('latest answer');
    await ask(ctx.app, { question: 'follow up', conversationId });

    const round1OfSecond = mockGatewayRun.mock.calls[2][0] as { input: { history?: unknown[] } };
    expect(round1OfSecond.input.history).toHaveLength(12);
  });

  it('stays backward compatible: no conversationId still returns the legacy fields', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentAskRoute(ctx.app);

    mockAnsweredExchange('1 failed.');
    const res = await ask(ctx.app, { question: 'How many failed this week?' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('answer');
    expect(body).toHaveProperty('toolsUsed');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('conversationId'); // additive, non-breaking
  });
});
