import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  handleCreateConversation,
  handleCreateFeedback,
  handleCreateMessage,
  handleGetConversation,
  getRelayConversationById,
  handleListConversations,
  handleListFeedback,
  handleListMessages,
  handleUpdateConversation,
  type RelayConversation
} from '@fauward/relay-api';
import { getRelayAdminClient } from '@fauward/relay-api';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { runRelayAi } from './relay.ai.service.js';

function buildRelayRequest(request: FastifyRequest) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }

  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(request.body ?? {});
  const origin = `${request.protocol}://${request.hostname}`;

  return new Request(`${origin}${request.url}`, {
    method,
    headers,
    body
  });
}

async function sendRelayResponse(reply: FastifyReply, response: Response) {
  const contentType = response.headers.get('content-type');
  if (contentType) reply.type(contentType);
  reply.status(response.status);
  const body = await response.text();
  return reply.send(body);
}

async function forwardRelayResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  handler: (request: Request) => Promise<Response>
) {
  try {
    return await sendRelayResponse(reply, await handler(buildRelayRequest(request)));
  } catch (error) {
    request.log.error({ error }, 'Relay request failed');
    const message = error instanceof Error ? error.message : 'Relay request failed';
    return reply.status(502).send({ error: message });
  }
}

async function forwardRelayConversationResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  handler: (request: Request, conversationId: string) => Promise<Response>
) {
  const { id } = request.params as { id: string };
  try {
    return await sendRelayResponse(reply, await handler(buildRelayRequest(request), id));
  } catch (error) {
    request.log.error({ error, conversationId: id }, 'Relay conversation request failed');
    const message = error instanceof Error ? error.message : 'Relay request failed';
    return reply.status(502).send({ error: message });
  }
}

async function optionalAuthenticate(request: FastifyRequest, reply: FastifyReply) {
  const authorization = request.headers.authorization;
  if (!authorization) return;
  return authenticate(request, reply);
}

async function requireTenantPortalAuth(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { source_app?: string; tenant_id?: string } | null;
  if (body?.source_app !== 'tenant_portal') return;

  if (request.user?.role === 'SUPER_ADMIN') return;
  if (request.user?.tenantId && (!body.tenant_id || request.user.tenantId === body.tenant_id)) return;

  if (process.env.NODE_ENV === 'development' && typeof body.tenant_id === 'string' && body.tenant_id.startsWith('tenant_')) {
    return;
  }

  return reply.status(403).send({ error: 'Tenant authentication required for tenant portal conversations' });
}

function isAllowedDevTenantAccess(tenantId: string | null | undefined) {
  return process.env.NODE_ENV === 'development' && typeof tenantId === 'string' && tenantId.startsWith('tenant_');
}

async function requireTenantConversationAccess(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  let conversation;
  try {
    conversation = await getRelayConversationById(id);
  } catch {
    return reply.status(404).send({ error: 'Conversation not found' });
  }

  if (conversation.source_app !== 'tenant_portal') return;
  if (request.user?.role === 'SUPER_ADMIN') return;
  if (request.user?.tenantId && request.user.tenantId === conversation.tenant_id) return;
  if (isAllowedDevTenantAccess(conversation.tenant_id)) return;

  return reply.status(403).send({ error: 'Tenant authentication required for this conversation' });
}

async function requireFeedbackConversationAccess(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { conversation_id?: string; tenant_id?: string } | null;
  if (!body?.conversation_id) return;

  let conversation;
  try {
    conversation = await getRelayConversationById(body.conversation_id);
  } catch {
    return reply.status(404).send({ error: 'Conversation not found' });
  }

  if (conversation.source_app !== 'tenant_portal') return;
  if (request.user?.role === 'SUPER_ADMIN') return;
  if (request.user?.tenantId && request.user.tenantId === conversation.tenant_id) return;
  if (isAllowedDevTenantAccess(conversation.tenant_id)) return;

  return reply.status(403).send({ error: 'Tenant authentication required for this conversation' });
}

export async function registerRelayRoutes(app: FastifyInstance) {
  app.get('/api/v1/relay/conversations', { preHandler: [authenticate] }, async (request, reply) => {
    return forwardRelayResponse(request, reply, handleListConversations);
  });

  app.post(
    '/api/v1/relay/conversations',
    { preHandler: [optionalAuthenticate, requireTenantPortalAuth] },
    async (request, reply) => {
      try {
        const body = request.body as Record<string, unknown> | null;
        const relayResponse = await handleCreateConversation(buildRelayRequest(request));

        if (relayResponse.status === 201) {
          try {
            const clone = relayResponse.clone();
            const data = (await clone.json()) as { conversation_id: string };
            const conv = await getRelayConversationById(data.conversation_id);
            fireRelayAi(data.conversation_id, String(body?.first_message ?? ''), conv, app);
          } catch (error) {
            request.log.error({ error }, 'Failed to start relay AI for new conversation');
          }
        }

        return sendRelayResponse(reply, relayResponse);
      } catch (error) {
        request.log.error({ error }, 'Relay request failed');
        const message = error instanceof Error ? error.message : 'Relay request failed';
        return reply.status(502).send({ error: message });
      }
    }
  );

  app.get('/api/v1/relay/conversations/:id', { preHandler: [optionalAuthenticate, requireTenantConversationAccess] }, async (request, reply) => {
    return forwardRelayConversationResponse(request, reply, handleGetConversation);
  });

  app.patch('/api/v1/relay/conversations/:id', { preHandler: [authenticate, requireTenantConversationAccess] }, async (request, reply) => {
    return forwardRelayConversationResponse(request, reply, handleUpdateConversation);
  });

  app.get('/api/v1/relay/conversations/:id/messages', { preHandler: [optionalAuthenticate, requireTenantConversationAccess] }, async (request, reply) => {
    return forwardRelayConversationResponse(request, reply, handleListMessages);
  });

  app.post('/api/v1/relay/conversations/:id/messages', { preHandler: [optionalAuthenticate, requireTenantConversationAccess] }, async (request, reply) => {
    const { id: conversationId } = request.params as { id: string };
    try {
      const body = request.body as Record<string, unknown> | null;
      const relayResponse = await handleCreateMessage(buildRelayRequest(request), conversationId);

      if (relayResponse.status === 201 && body?.sender_type === 'customer') {
        try {
          const conv = await getRelayConversationById(conversationId);
          fireRelayAi(conversationId, String(body.body ?? ''), conv, app);
        } catch (error) {
          request.log.error({ error, conversationId }, 'Failed to start relay AI for customer message');
        }
      }

      return sendRelayResponse(reply, relayResponse);
    } catch (error) {
      request.log.error({ error, conversationId }, 'Relay conversation request failed');
      const message = error instanceof Error ? error.message : 'Relay request failed';
      return reply.status(502).send({ error: message });
    }
  });

  app.get('/api/v1/relay/feedback', { preHandler: [authenticate] }, async (request, reply) => {
    return forwardRelayResponse(request, reply, handleListFeedback);
  });

  app.post('/api/v1/relay/feedback', { preHandler: [optionalAuthenticate, requireFeedbackConversationAccess] }, async (request, reply) => {
    return forwardRelayResponse(request, reply, handleCreateFeedback);
  });

  app.post('/api/v1/tenant/relay/messages/:id/approve-and-send', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const supabase = getRelayAdminClient();
    const { data: message, error: readError } = await supabase
      .from('relay_messages')
      .select('*')
      .eq('id', id)
      .single();
    if (readError || !message) return reply.status(404).send({ error: 'Relay message not found' });
    if (message.sender_type === 'customer') return reply.status(422).send({ error: 'Customer messages cannot be approved for sending' });

    const { data: conversation, error: conversationError } = await supabase
      .from('relay_conversations')
      .select('id, tenant_id')
      .eq('id', message.conversation_id)
      .single();
    if (conversationError || !conversation) return reply.status(404).send({ error: 'Relay conversation not found' });
    if (conversation.tenant_id !== tenantId) return reply.status(403).send({ error: 'Relay message belongs to another tenant' });

    // This approval flip is the delivery signal consumed by Relay realtime clients.
    // System status notifications from TrackingEvents are deterministic and are the only non-draft exception.
    const { error } = await supabase
      .from('relay_messages')
      .update({
        is_draft: false,
        draft_mode: false,
        approved_by: request.user?.sub ?? null,
        approved_at: new Date().toISOString()
      })
      .eq('id', id);
    if (error) return reply.status(400).send({ error: error.message });
    reply.send({ sent: true, messageId: id });
  });
}

function fireRelayAi(
  conversationId: string,
  message: string,
  conversation: RelayConversation,
  app: FastifyInstance
): void {
  if (conversation.ai_status === 'human_needed') return;
  void runRelayAi(conversationId, message, conversation, app).catch((err: unknown) => {
    app.log.error({ err, conversationId }, 'relay ai run error');
  });
}
