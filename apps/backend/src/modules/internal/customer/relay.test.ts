import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@fauward/internal-rbac';
import type { PrismaClient } from '@prisma/client';
import type { RelayConversation } from '@fauward/relay-api';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant, inertRedis } from '../../../test-support/test-db.js';

// L2 / L20 (WP-4.R): the console reads and answers Relay through /api/internal/relay/* with its cookie session; a staff
// reply is sent at once and signed; an AI draft is approved (optionally edited) by a staff member, who is recorded; a
// conversation becomes one PLATFORM ticket. Relay itself (Supabase) is an in-memory store here; tickets, audit,
// activity and staff notifications are real Postgres rows.

type Row = Record<string, unknown>;
const relay = vi.hoisted(() => ({ conversations: [] as Row[], messages: [] as Row[], failing: false }));

vi.mock('@fauward/relay-api', () => {
  function query(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    const rows = () => (table === 'relay_messages' ? relay.messages : relay.conversations);
    const matching = () => rows().filter((row) => filters.every((filter) => filter(row)));
    const builder = {
      select: () => builder,
      update: (values: Row) => {
        patch = values;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      single: async () => {
        const found = matching();
        if (patch) for (const row of found) Object.assign(row, patch);
        return found[0] ? { data: found[0], error: null } : { data: null, error: { message: 'not found' } };
      },
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: matching(), error: null })
    };
    return builder;
  }
  const find = (id: string) => {
    if (relay.failing) throw new Error('supabase down');
    const row = relay.conversations.find((item) => item.id === id);
    if (!row) throw new Error('not found');
    return row;
  };
  return {
    getRelayAdminClient: () => ({ from: query }),
    getRelayConversationById: vi.fn(async (id: string) => find(id)),
    listRelayConversations: vi.fn(async () => {
      if (relay.failing) throw new Error('supabase down');
      return relay.conversations;
    }),
    listRelayMessages: vi.fn(async (id: string, options: { includeDrafts?: boolean } = {}) => relay.messages.filter((row) => row.conversation_id === id && (options.includeDrafts || row.is_draft !== true))),
    createRelayMessage: vi.fn(async (conversationId: string, input: Row) => {
      const row = { id: globalThis.crypto.randomUUID(), conversation_id: conversationId, read_at: null, created_at: new Date().toISOString(), draft_mode: input.is_draft, ...input };
      relay.messages.push(row);
      return row;
    }),
    updateRelayConversation: vi.fn(async (id: string, input: Row) => Object.assign(find(id), input)),
    listRelayFeedback: vi.fn(async () => [])
  };
});

const session = vi.hoisted(() => ({ permissions: [] as Permission[], userId: 'unset' }));
vi.mock('../../../middleware/authenticate-platform-session.js', () => ({
  authenticatePlatformSession: async (request: { platform?: unknown; headers: Record<string, unknown> }) => {
    // The console sends its cookie session, never a Bearer token.
    if (request.headers.authorization) throw new Error('console requests must not carry an Authorization header');
    request.platform = {
      user: { id: session.userId, email: 'support@fauward.test', name: 'Support', status: 'ACTIVE', mfaEnabled: true },
      session: { id: 'ps_relay', mfaVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      claims: { sub: session.userId }
    };
  }
}));
vi.mock('../../../middleware/require-platform-csrf.js', () => ({ requirePlatformCsrf: async () => undefined }));
vi.mock('../../../services/staff-iam.service.js', () => ({
  consolePermissionContext: vi.fn(async () => ({ staff: null, roles: [], rolePermissions: new Set(session.permissions), jit: new Map(), permissions: session.permissions }))
}));
vi.mock('../../../modules/notifications/notifications.service.js', () => ({ sendEmail: vi.fn(async () => undefined), sendStaffEmail: vi.fn(async () => undefined) }));

// Fresh ids per run: activity dedupe keys and the ticket's relayConversationId are unique on the shared slot database.
let CONVERSATION = randomUUID();
let DRAFT = randomUUID();
let CUSTOMER_MESSAGE = randomUUID();

describe.runIf(HAS_TEST_DB)('Relay in the console (WP-4.R, L2/L20)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let tenantId: string;

  beforeAll(async () => {
    prisma = createTestPrisma();
    session.userId = (await createTestPlatformUser(prisma, { name: 'Support' })).id;
    tenantId = (await createTestTenant(prisma, { plan: 'PRO', status: 'ACTIVE' })).id;
    app = Fastify();
    app.decorate('prisma', prisma);
    app.decorate('redis', inertRedis() as never);
    const { registerConsoleRelayRoutes } = await import('./relay.routes.js');
    await registerConsoleRelayRoutes(app);
    await app.ready();
  });

  beforeEach(() => {
    CONVERSATION = randomUUID();
    DRAFT = randomUUID();
    CUSTOMER_MESSAGE = randomUUID();
    session.permissions = ['customer.support.read', 'customer.support.write'];
    relay.failing = false;
    relay.conversations.splice(0, relay.conversations.length, {
      id: CONVERSATION,
      tenant_id: tenantId,
      source_app: 'tenant_portal',
      customer_name: 'Dana Ops',
      customer_email: 'dana@tenant.test',
      subject: 'Invoice question',
      status: 'open',
      ai_status: 'human_needed',
      assigned_admin_id: null,
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
    relay.messages.splice(0, relay.messages.length,
      { id: CUSTOMER_MESSAGE, conversation_id: CONVERSATION, sender_type: 'customer', sender_id: null, body: 'Why was I charged twice?', is_draft: false, created_at: new Date().toISOString() },
      { id: DRAFT, conversation_id: CONVERSATION, sender_type: 'admin', sender_id: null, body: 'AI draft: sorry about that', is_draft: true, draft_mode: true, approved_by: null, approved_at: null, created_at: new Date().toISOString() }
    );
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-L2-1 console reads and replies through /api/internal/relay/* with the cookie session; the reply is sent and signed', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/internal/relay/conversations?status=open' })).json();
    expect(list.data).toEqual([expect.objectContaining({ id: CONVERSATION, tenant: expect.objectContaining({ id: tenantId }), pendingDrafts: true })]);
    const detail = (await app.inject({ method: 'GET', url: `/api/internal/relay/conversations/${CONVERSATION}` })).json();
    expect(detail.messages.map((message: { isDraft: boolean }) => message.isDraft)).toEqual([false, true]);

    const reply = await app.inject({ method: 'POST', url: `/api/internal/relay/conversations/${CONVERSATION}/messages`, payload: { body: 'We refunded the duplicate charge.' } });
    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({ senderType: 'admin', isDraft: false, approvedBy: session.userId, senderId: session.userId });
    expect(await prisma.platformAuditLog.count({ where: { action: 'RELAY_MESSAGE_SENT', targetTenantId: tenantId } })).toBeGreaterThanOrEqual(1);
    expect(await prisma.platformActivity.count({ where: { tenantId, type: 'relay.message.sent' } })).toBeGreaterThanOrEqual(1);

    const assigned = (await app.inject({ method: 'PATCH', url: `/api/internal/relay/conversations/${CONVERSATION}`, payload: { assignToMe: true } })).json();
    expect(assigned).toMatchObject({ status: 'assigned', assignedTo: session.userId });
    expect(await prisma.platformActivity.count({ where: { tenantId, type: 'relay.conversation.updated', subjectId: CONVERSATION } })).toBe(1);
    expect(await prisma.platformAuditLog.count({ where: { action: 'RELAY_CONVERSATION_UPDATED', targetTenantId: tenantId } })).toBeGreaterThanOrEqual(1);

    session.permissions = ['customer.support.read'];
    expect((await app.inject({ method: 'POST', url: `/api/internal/relay/conversations/${CONVERSATION}/messages`, payload: { body: 'No permission' } })).statusCode).toBe(403);
    relay.failing = true;
    const down = await app.inject({ method: 'GET', url: '/api/internal/relay/conversations' });
    expect(down.statusCode).toBe(502);
    expect(down.json()).toMatchObject({ error: 'RELAY_UNAVAILABLE', degraded: true });
  });

  it('ACC-L20-1 approve-and-send has a console caller and records the approving staff member (edited text kept)', async () => {
    const approved = await app.inject({ method: 'POST', url: `/api/internal/relay/messages/${DRAFT}/approve-and-send`, payload: { body: 'Sorry about that: the duplicate charge is refunded.' } });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ isDraft: false, approvedBy: session.userId, body: 'Sorry about that: the duplicate charge is refunded.' });
    expect(relay.messages.find((row) => row.id === DRAFT)).toMatchObject({ is_draft: false, draft_mode: false, approved_by: session.userId });
    expect((await app.inject({ method: 'POST', url: `/api/internal/relay/messages/${DRAFT}/approve-and-send`, payload: {} })).json()).toMatchObject({ error: 'ALREADY_SENT' });
    expect((await app.inject({ method: 'POST', url: `/api/internal/relay/messages/${CUSTOMER_MESSAGE}/approve-and-send`, payload: {} })).json()).toMatchObject({ error: 'NOT_A_DRAFT' });
    const audit = await prisma.platformAuditLog.findFirstOrThrow({ where: { action: 'RELAY_DRAFT_APPROVED', targetTenantId: tenantId }, orderBy: { createdAt: 'desc' } });
    expect(audit).toMatchObject({ actorId: session.userId, metadata: expect.objectContaining({ messageId: DRAFT, edited: 'yes' }) });
    expect(await prisma.platformActivity.count({ where: { tenantId, type: 'relay.draft_approved' } })).toBeGreaterThanOrEqual(1);
  });

  it('L2 convert to ticket creates one PLATFORM ticket linked to the conversation, with the transcript', async () => {
    const converted = await app.inject({ method: 'POST', url: `/api/internal/relay/conversations/${CONVERSATION}/convert-to-ticket`, payload: { category: 'BILLING_QUERY' } });
    expect(converted.statusCode).toBe(201);
    const ticket = await prisma.supportTicket.findFirstOrThrow({ where: { tenantId, relayConversationId: CONVERSATION }, include: { messages: true } });
    expect(ticket).toMatchObject({ audience: 'PLATFORM', category: 'BILLING_QUERY', subject: 'Relay: Invoice question', assignedPlatformUserId: session.userId });
    expect(ticket.messages[0].body).toContain('Why was I charged twice?');
    // The unapproved draft is not part of the tenant-visible transcript.
    expect(ticket.messages[0].body).not.toContain('AI draft');
    expect((await app.inject({ method: 'POST', url: `/api/internal/relay/conversations/${CONVERSATION}/convert-to-ticket`, payload: {} })).json()).toMatchObject({ error: 'ALREADY_CONVERTED' });
    expect((await app.inject({ method: 'GET', url: `/api/internal/relay/conversations/${CONVERSATION}` })).json().ticket).toMatchObject({ id: ticket.id });
    expect(await prisma.platformActivity.count({ where: { tenantId, type: 'relay.converted_to_ticket' } })).toBe(1);

    relay.conversations[0].tenant_id = null;
    relay.conversations[0].source_app = 'marketing';
    expect((await app.inject({ method: 'POST', url: `/api/internal/relay/conversations/${CONVERSATION}/convert-to-ticket`, payload: {} })).json()).toMatchObject({ error: 'NO_TENANT' });
  });

  it('L2 an inbound tenant message records relay.message.received and notifies support staff', async () => {
    const { recordInboundRelayMessage } = await import('../../../services/relay-console.service.js');
    const holder = await createTestPlatformUser(prisma, { name: 'Support agent' });
    const role = await prisma.staffRole.create({ data: { id: `test-relay-${Date.now()}`, name: 'Support writers', description: 'test', permissions: ['customer.support.write'] } });
    const staff = await prisma.staffUser.create({ data: { platformUserId: holder.id, email: holder.email, name: 'Support agent' } });
    await prisma.staffRoleAssignment.create({ data: { staffId: staff.id, roleId: role.id } });
    const messageId = randomUUID();
    await recordInboundRelayMessage(app, relay.conversations[0] as RelayConversation, messageId);
    expect(await prisma.platformActivity.count({ where: { tenantId, type: 'relay.message.received', dedupeKey: `relay.message.received:${messageId}` } })).toBe(1);
    expect(await prisma.staffNotification.count({ where: { platformUserId: holder.id, event: 'relay.message.received', tenantId } })).toBe(1);
  });
});
