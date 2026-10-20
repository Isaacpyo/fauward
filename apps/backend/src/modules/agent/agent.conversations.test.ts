import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerAgentConversationRoutes, deriveTitle } from './agent.conversations.js';

interface ConvRow {
  id: string;
  tenantId: string;
  createdBy: string;
  title: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}
interface MsgRow {
  id: string;
  tenantId: string;
  conversationId: string;
  role: string;
  content: string;
  status: string | null;
  toolsUsed: unknown;
  proposedActionIds: string[];
  createdAt: number;
}

function buildApp(tenantOverrides: Record<string, unknown> = {}) {
  const app = Fastify();
  app.register(import('@fastify/sensible'));

  const conversations: ConvRow[] = [];
  const messages: MsgRow[] = [];

  const prisma = {
    // requireFeature reads entitlements (WP-1.4): no plan or feature overrides here.
    tenantPlanOverride: { findFirst: vi.fn(async () => null) },
    tenantFeatureOverride: { findMany: vi.fn(async () => []) },
    agentConversation: {
      findMany: vi.fn(
        async ({
          where,
          orderBy,
          skip = 0,
          take = 20
        }: {
          where: { tenantId: string; archived: boolean };
          orderBy?: { updatedAt: 'asc' | 'desc' };
          skip?: number;
          take?: number;
        }) => {
          let rows = conversations.filter(
            (c) => c.tenantId === where.tenantId && c.archived === where.archived
          );
          rows = rows.sort((a, b) => b.updatedAt - a.updatedAt);
          if (orderBy?.updatedAt === 'asc') rows = rows.reverse();
          return rows.slice(skip, skip + take).map((c) => ({
            ...c,
            _count: { messages: messages.filter((m) => m.conversationId === c.id).length }
          }));
        }
      ),
      count: vi.fn(async ({ where }: { where: { tenantId: string; archived: boolean } }) =>
        conversations.filter((c) => c.tenantId === where.tenantId && c.archived === where.archived).length
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const row = conversations.find((c) => c.id === where.id && c.tenantId === where.tenantId);
        return row ?? null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = conversations.find((c) => c.id === where.id);
          if (!row) throw new Error('not found');
          if (data.title !== undefined) row.title = data.title as string;
          if (data.archived !== undefined) row.archived = data.archived as boolean;
          row.updatedAt += 1;
          return row;
        }
      )
    },
    agentMessage: {
      findMany: vi.fn(
        async ({
          where,
          orderBy
        }: {
          where: { tenantId: string; conversationId: string };
          orderBy?: { createdAt: 'asc' | 'desc' };
        }) => {
          let rows = messages.filter(
            (m) => m.tenantId === where.tenantId && m.conversationId === where.conversationId
          );
          rows = rows.sort((a, b) => a.createdAt - b.createdAt);
          if (orderBy?.createdAt === 'desc') rows = rows.reverse();
          return rows;
        }
      )
    }
  };

  (app as unknown as { decorate: (k: string, v: unknown) => void }).decorate('prisma', prisma);
  (app as unknown as { decorate: (k: string, v: unknown) => void }).decorate(
    'authenticate',
    async (req: { user?: unknown }) => {
      req.user = req.user ?? { sub: 'user-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
    }
  );
  app.addHook('onRequest', (req, _reply, done) => {
    (req as unknown as { tenant: unknown }).tenant = { id: 'tenant-1', slug: 'acme', plan: 'PRO', ...tenantOverrides };
    done();
  });

  return { app, prisma, conversations, messages };
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  while (apps.length) {
    const ctx = apps.pop();
    if (ctx) await ctx.app.close();
  }
});

describe('deriveTitle', () => {
  it('keeps short questions intact and truncates long ones with an ellipsis', () => {
    expect(deriveTitle('  How many failed?  ')).toBe('How many failed?');
    const long = 'a'.repeat(120);
    const title = deriveTitle(long);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('GET /api/v1/agent/conversations', () => {
  it('lists only the caller tenant, non-archived, most-recent first', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentConversationRoutes(ctx.app);

    ctx.conversations.push(
      { id: 'a', tenantId: 'tenant-1', createdBy: 'u', title: 'A', archived: false, createdAt: 1, updatedAt: 1 },
      { id: 'b', tenantId: 'tenant-1', createdBy: 'u', title: 'B', archived: false, createdAt: 2, updatedAt: 3 },
      { id: 'c', tenantId: 'tenant-1', createdBy: 'u', title: 'C', archived: true, createdAt: 3, updatedAt: 4 },
      { id: 'd', tenantId: 'tenant-2', createdBy: 'u', title: 'D', archived: false, createdAt: 4, updatedAt: 5 }
    );

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/conversations',
      headers: { authorization: 'Bearer token' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['b', 'a']); // b is newer, c archived, d other tenant
    expect(body.total).toBe(2);
  });

  it('returns archived conversations when archived=true', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentConversationRoutes(ctx.app);

    ctx.conversations.push(
      { id: 'a', tenantId: 'tenant-1', createdBy: 'u', title: 'A', archived: false, createdAt: 1, updatedAt: 1 },
      { id: 'c', tenantId: 'tenant-1', createdBy: 'u', title: 'C', archived: true, createdAt: 3, updatedAt: 4 }
    );

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/conversations?archived=true',
      headers: { authorization: 'Bearer token' }
    });
    const body = JSON.parse(res.payload);
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['c']);
  });
});

describe('GET /api/v1/agent/conversations/:id', () => {
  it('returns the conversation with messages ascending', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentConversationRoutes(ctx.app);

    ctx.conversations.push({ id: 'a', tenantId: 'tenant-1', createdBy: 'u', title: 'A', archived: false, createdAt: 1, updatedAt: 1 });
    ctx.messages.push(
      { id: 'm2', tenantId: 'tenant-1', conversationId: 'a', role: 'assistant', content: 'second', status: 'answered', toolsUsed: [], proposedActionIds: [], createdAt: 2 },
      { id: 'm1', tenantId: 'tenant-1', conversationId: 'a', role: 'user', content: 'first', status: null, toolsUsed: null, proposedActionIds: [], createdAt: 1 }
    );

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/conversations/a',
      headers: { authorization: 'Bearer token' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.messages.map((m: { content: string }) => m.content)).toEqual(['first', 'second']);
  });

  it('404s for a conversation owned by another tenant', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentConversationRoutes(ctx.app);

    ctx.conversations.push({ id: 'x', tenantId: 'tenant-2', createdBy: 'u', title: 'X', archived: false, createdAt: 1, updatedAt: 1 });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/agent/conversations/x',
      headers: { authorization: 'Bearer token' }
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/v1/agent/conversations/:id', () => {
  it('renames and archives a tenant-owned conversation', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentConversationRoutes(ctx.app);

    ctx.conversations.push({ id: 'a', tenantId: 'tenant-1', createdBy: 'u', title: 'old', archived: false, createdAt: 1, updatedAt: 1 });

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/agent/conversations/a',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: { title: 'new title', archived: true }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.title).toBe('new title');
    expect(body.archived).toBe(true);
  });

  it('404s when patching another tenant’s conversation', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentConversationRoutes(ctx.app);

    ctx.conversations.push({ id: 'x', tenantId: 'tenant-2', createdBy: 'u', title: 'X', archived: false, createdAt: 1, updatedAt: 1 });

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/agent/conversations/x',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: { archived: true }
    });
    expect(res.statusCode).toBe(404);
    expect(ctx.prisma.agentConversation.update).not.toHaveBeenCalled();
  });

  it('400s when neither title nor archived is provided', async () => {
    const ctx = buildApp();
    apps.push(ctx);
    await registerAgentConversationRoutes(ctx.app);

    ctx.conversations.push({ id: 'a', tenantId: 'tenant-1', createdBy: 'u', title: 'old', archived: false, createdAt: 1, updatedAt: 1 });

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/agent/conversations/a',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      payload: {}
    });
    expect(res.statusCode).toBe(400);
  });
});
