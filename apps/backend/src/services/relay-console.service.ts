import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createRelayMessage,
  getRelayAdminClient,
  getRelayConversationById,
  listRelayConversations,
  listRelayFeedback,
  listRelayMessages,
  updateRelayConversation,
  type RelayConversation,
  type RelayMessage
} from '@fauward/relay-api';
import { z } from 'zod';
import { nextTicketNumber } from './support-ticket.service.js';
import { recordAndPublishActivity, staffActor } from './platform-activity.service.js';
import { notifyStaff } from './platform-notifier.service.js';
import { writePlatformAuditLog } from './platform-audit.service.js';
import { platformAuditActor } from '../modules/internal/request-meta.js';

// L2 / L20 (WP-4.R): the console reads and answers Relay through the backend with its cookie session; the backend
// talks to Relay with the service client (`@fauward/relay-api`). Staff replies are sent at once; AI drafts stay hidden
// from the tenant until a staff member edits and approves them. A conversation can become a PLATFORM support ticket.

const SERVICE = 'customer.support';

export class RelayConsoleError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type RelayApp = FastifyInstance;

export const listConversationsQuery = z.object({
  status: z.enum(['open', 'assigned', 'closed']).optional(),
  source: z.enum(['marketing', 'tenant_portal']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  tenantId: z.string().min(1).optional()
});
export const replyBody = z.object({ body: z.string().trim().min(1).max(5000) });
export const approveBody = z.object({ body: z.string().trim().min(1).max(5000).optional() });
export const updateConversationBody = z
  .object({ status: z.enum(['open', 'assigned', 'closed']).optional(), assignToMe: z.boolean().optional(), unassign: z.boolean().optional() })
  .refine((body) => body.status !== undefined || body.assignToMe || body.unassign, 'Nothing to change');
export const convertBody = z.object({ category: z.enum(['DELIVERY_ISSUE', 'PAYMENT_ISSUE', 'DAMAGED_GOODS', 'WRONG_ADDRESS', 'TRACKING_ISSUE', 'RETURN_REQUEST', 'BILLING_QUERY', 'OTHER']).default('OTHER') });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function conversationOr404(id: string) {
  if (!UUID.test(id)) throw new RelayConsoleError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  try {
    return await getRelayConversationById(id);
  } catch {
    throw new RelayConsoleError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
}

async function tenantLabels(app: Pick<FastifyInstance, 'prisma'>, ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const rows = unique.length ? await app.prisma.tenant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, slug: true } }) : [];
  return new Map(rows.map((row) => [row.id, row]));
}

function presentConversation(row: RelayConversation, tenants: Map<string, { id: string; name: string; slug: string }>) {
  const tenant = row.tenant_id ? tenants.get(row.tenant_id) : undefined;
  return {
    id: row.id,
    source: row.source_app,
    tenant: row.tenant_id ? { id: row.tenant_id, name: tenant?.name ?? row.tenant_id, slug: tenant?.slug ?? null } : null,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    subject: row.subject,
    status: row.status,
    aiStatus: row.ai_status ?? null,
    assignedTo: row.assigned_admin_id,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at
  };
}

function presentMessage(row: RelayMessage) {
  return {
    id: row.id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    body: row.body,
    isDraft: row.is_draft === true,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ?? null,
    createdAt: row.created_at
  };
}

export async function listConversations(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof listConversationsQuery>) {
  const rows = await listRelayConversations({ status: query.status, source_app: query.source, search: query.search, tenant_id: query.tenantId });
  const tenants = await tenantLabels(app, rows.map((row) => row.tenant_id));
  const drafts = rows.length
    ? await getRelayAdminClient().from('relay_messages').select('conversation_id').eq('is_draft', true).in('conversation_id', rows.map((row) => row.id))
    : { data: [] as Array<{ conversation_id: string }>, error: null };
  const withDrafts = new Set((drafts.data ?? []).map((row: { conversation_id: string }) => row.conversation_id));
  return { data: rows.slice(0, 200).map((row) => ({ ...presentConversation(row, tenants), pendingDrafts: withDrafts.has(row.id) })) };
}

export async function getConversation(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const conversation = await conversationOr404(id);
  const [messages, tenants, ticket] = await Promise.all([
    listRelayMessages(id, { includeDrafts: true }),
    tenantLabels(app, [conversation.tenant_id]),
    conversation.tenant_id ? app.prisma.supportTicket.findFirst({ where: { tenantId: conversation.tenant_id, relayConversationId: id }, select: { id: true, ticketNumber: true, status: true } }) : null
  ]);
  return { ...presentConversation(conversation, tenants), messages: messages.map(presentMessage), ticket };
}

function activityBase(request: FastifyRequest, conversation: RelayConversation) {
  return { service: SERVICE, tenantId: conversation.tenant_id, ...staffActor(request), subjectType: 'relay_conversation', subjectId: conversation.id, consoleLink: `/customer/support/relay/${conversation.id}` };
}

async function audit(app: RelayApp, request: FastifyRequest, action: string, conversation: RelayConversation, metadata: Record<string, string | null>) {
  await writePlatformAuditLog(app.prisma, { ...platformAuditActor(request), actorType: 'PLATFORM_USER', action, targetTenantId: conversation.tenant_id, reason: null, metadata: { conversationId: conversation.id, ...metadata } });
}

/** A staff reply: sent at once (not a draft), signed by the staff member. */
export async function replyToConversation(app: RelayApp, request: FastifyRequest, id: string, body: z.infer<typeof replyBody>, now = new Date()) {
  const conversation = await conversationOr404(id);
  if (conversation.status === 'closed') throw new RelayConsoleError(409, 'CONVERSATION_CLOSED', 'Reopen the conversation to reply.');
  const staffId = request.platform!.user.id;
  const message = await createRelayMessage(id, { sender_type: 'admin', sender_id: staffId, body: body.body, is_draft: false, approved_by: staffId, approved_at: now.toISOString() });
  await audit(app, request, 'RELAY_MESSAGE_SENT', conversation, { messageId: message.id });
  await recordAndPublishActivity(app, { ...activityBase(request, conversation), type: 'relay.message.sent', summary: `Relay reply sent${conversation.subject ? `: ${conversation.subject}` : ''}`, dedupeKey: `relay.message.sent:${message.id}` });
  return presentMessage(message);
}

/** L20: a staff member approves an AI (or other) draft, optionally edited; the tenant sees it from then on. */
export async function approveDraft(app: RelayApp, request: FastifyRequest, messageId: string, body: z.infer<typeof approveBody>, now = new Date()) {
  if (!UUID.test(messageId)) throw new RelayConsoleError(404, 'MESSAGE_NOT_FOUND', 'Relay message not found');
  const supabase = getRelayAdminClient();
  const { data: message, error } = await supabase.from('relay_messages').select('*').eq('id', messageId).single<RelayMessage>();
  if (error || !message) throw new RelayConsoleError(404, 'MESSAGE_NOT_FOUND', 'Relay message not found');
  if (message.sender_type === 'customer') throw new RelayConsoleError(422, 'NOT_A_DRAFT', 'Customer messages cannot be approved for sending.');
  if (message.is_draft !== true) throw new RelayConsoleError(409, 'ALREADY_SENT', 'This message was already sent.');
  const conversation = await conversationOr404(message.conversation_id);
  const staffId = request.platform!.user.id;
  const originalBody = message.body;
  const update = { is_draft: false, draft_mode: false, approved_by: staffId, approved_at: now.toISOString(), ...(body.body ? { body: body.body } : {}) };
  const { data: updated, error: updateError } = await supabase.from('relay_messages').update(update).eq('id', messageId).eq('is_draft', true).select('*').single<RelayMessage>();
  if (updateError || !updated) throw new RelayConsoleError(409, 'ALREADY_SENT', 'This message was already sent.');
  const edited = Boolean(body.body && body.body !== originalBody);
  await audit(app, request, 'RELAY_DRAFT_APPROVED', conversation, { messageId, edited: edited ? 'yes' : 'no' });
  await recordAndPublishActivity(app, { ...activityBase(request, conversation), type: 'relay.draft_approved', summary: `Relay draft ${edited ? 'edited and ' : ''}approved and sent`, dedupeKey: `relay.draft_approved:${messageId}` });
  return presentMessage(updated);
}

export async function updateConversation(app: RelayApp, request: FastifyRequest, id: string, body: z.infer<typeof updateConversationBody>) {
  const conversation = await conversationOr404(id);
  const staffId = request.platform!.user.id;
  const updated = await updateRelayConversation(id, {
    ...(body.status ? { status: body.status } : {}),
    ...(body.assignToMe ? { assigned_admin_id: staffId, ...(body.status ? {} : { status: 'assigned' as const }) } : {}),
    ...(body.unassign ? { assigned_admin_id: null } : {})
  });
  await audit(app, request, 'RELAY_CONVERSATION_UPDATED', conversation, { from: conversation.status, to: updated.status, assignedTo: updated.assigned_admin_id });
  const change = body.assignToMe ? 'assigned' : body.unassign ? 'unassigned' : updated.status;
  await recordAndPublishActivity(app, { ...activityBase(request, conversation), type: 'relay.conversation.updated', summary: `Relay conversation ${change}${conversation.subject ? `: ${conversation.subject}` : ''}` });
  const tenants = await tenantLabels(app, [updated.tenant_id]);
  return presentConversation(updated, tenants);
}

/** Creates one PLATFORM ticket for the conversation's tenant with the conversation so far; refuses a second. */
export async function convertToTicket(app: RelayApp, request: FastifyRequest, id: string, body: z.infer<typeof convertBody>, now = new Date()) {
  const conversation = await conversationOr404(id);
  const tenantId = conversation.tenant_id;
  if (!tenantId) throw new RelayConsoleError(409, 'NO_TENANT', 'Only conversations from a tenant can become a support ticket.');
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) throw new RelayConsoleError(409, 'NO_TENANT', 'The conversation\'s tenant no longer exists.');
  const existing = await app.prisma.supportTicket.findFirst({ where: { tenantId, relayConversationId: id }, select: { id: true, ticketNumber: true } });
  if (existing) throw new RelayConsoleError(409, 'ALREADY_CONVERTED', `Already converted to ${existing.ticketNumber}.`);
  const messages = (await listRelayMessages(id)).filter((message) => message.sender_type !== 'system');
  const transcript = messages.map((message) => `${message.sender_type === 'customer' ? conversation.customer_name ?? 'Tenant' : 'Fauward'}: ${message.body}`).join('\n\n') || '(no messages)';
  const ticketNumber = await nextTicketNumber(app.prisma, tenantId, 'PLATFORM', now);
  const staffId = request.platform!.user.id;
  const ticket = await app.prisma.supportTicket.create({
    data: {
      tenantId,
      ticketNumber,
      audience: 'PLATFORM',
      subject: (conversation.subject ? `Relay: ${conversation.subject}` : `Relay conversation with ${conversation.customer_name ?? tenant.name}`).slice(0, 200),
      category: body.category,
      relayConversationId: id,
      assignedPlatformUserId: staffId,
      lastMessageAt: now,
      lastMessageAuthorType: 'STAFF',
      messages: { create: { tenantId, platformAuthorId: staffId, authorType: 'STAFF', visibility: 'STAFF_INTERNAL', body: `Converted from Relay conversation ${id}.\n\n${transcript}`.slice(0, 20_000), createdAt: now } }
    }
  });
  await audit(app, request, 'RELAY_CONVERTED_TO_TICKET', conversation, { ticketId: ticket.id, ticketNumber });
  await recordAndPublishActivity(app, { ...activityBase(request, conversation), type: 'relay.converted_to_ticket', summary: `${tenant.name}: Relay conversation converted to ${ticketNumber}`, consoleLink: `/customer/support/tickets/${ticket.id}`, dedupeKey: `relay.converted_to_ticket:${id}` });
  return { ticket: { id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status } };
}

export async function listFeedback() {
  const rows = await listRelayFeedback();
  return { data: rows.slice(0, 200) };
}

/** L2 inbound (tenant or visitor message): activity + bell for support staff. Never throws. */
export async function recordInboundRelayMessage(app: RelayApp, conversation: RelayConversation, messageId: string | null) {
  try {
    const tenant = conversation.tenant_id ? await app.prisma.tenant.findUnique({ where: { id: conversation.tenant_id }, select: { name: true } }) : null;
    const who = tenant?.name ?? conversation.customer_name ?? conversation.customer_email ?? 'A visitor';
    await recordAndPublishActivity(app, {
      service: SERVICE,
      type: 'relay.message.received',
      tenantId: conversation.tenant_id,
      actorType: 'SYSTEM',
      actorId: null,
      actorLabel: who,
      subjectType: 'relay_conversation',
      subjectId: conversation.id,
      summary: `${who} wrote in Relay${conversation.subject ? `: ${conversation.subject}` : ''}`,
      severity: 'ATTENTION',
      consoleLink: `/customer/support/relay/${conversation.id}`,
      dedupeKey: `relay.message.received:${messageId ?? conversation.id}`
    });
    await notifyStaff(app, { permission: 'customer.support.write', event: 'relay.message.received', title: `${who} wrote in Relay`, link: `/customer/support/relay/${conversation.id}`, severity: 'ATTENTION', tenantId: conversation.tenant_id });
  } catch (error) {
    app.log.error({ err: error, conversationId: conversation.id }, 'Could not record an inbound Relay message');
  }
}
