import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';

const TITLE_MAX = 80;

/** Derive a conversation title from the opening question (first ~80 chars). */
export function deriveTitle(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= TITLE_MAX) return trimmed;
  return `${trimmed.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

const ListQuerySchema = z.object({
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? false : v === 'true')),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20)
});

const PatchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    archived: z.boolean().optional()
  })
  .refine((b) => b.title !== undefined || b.archived !== undefined, {
    message: 'Provide at least one of title or archived'
  });

export async function registerAgentConversationRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = [app.authenticate, requireTenantMatch, requireFeature('agent')];

  // List conversations (most-recently-updated first), scoped to the tenant.
  app.get('/api/v1/agent/conversations', { preHandler }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    const { archived, page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const where = { tenantId, archived };

    const [items, total] = await Promise.all([
      app.prisma.agentConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          archived: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } }
        }
      }),
      app.prisma.agentConversation.count({ where })
    ]);

    return reply.send({
      items: items.map((c) => ({
        id: c.id,
        title: c.title,
        archived: c.archived,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c._count.messages
      })),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    });
  });

  // Get a single conversation with its messages (ascending). Cross-tenant id => 404.
  app.get('/api/v1/agent/conversations/:id', { preHandler }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const { id } = request.params as { id: string };
    const conversation = await app.prisma.agentConversation.findFirst({
      where: { id, tenantId }
    });
    if (!conversation) throw app.httpErrors.notFound('Conversation not found');

    const messages = await app.prisma.agentMessage.findMany({
      where: { tenantId, conversationId: id },
      orderBy: { createdAt: 'asc' }
    });

    return reply.send({
      id: conversation.id,
      title: conversation.title,
      archived: conversation.archived,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        toolsUsed: m.toolsUsed,
        proposedActionIds: m.proposedActionIds,
        createdAt: m.createdAt
      }))
    });
  });

  // Rename / archive a conversation. Tenant-scoped existence check before update.
  app.patch('/api/v1/agent/conversations/:id', { preHandler }, async (request, reply) => {
    const tenantId = request.tenant?.id;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const { id } = request.params as { id: string };
    const parsed = PatchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const existing = await app.prisma.agentConversation.findFirst({
      where: { id, tenantId },
      select: { id: true }
    });
    if (!existing) throw app.httpErrors.notFound('Conversation not found');

    const updated = await app.prisma.agentConversation.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.archived !== undefined ? { archived: parsed.data.archived } : {})
      },
      select: { id: true, title: true, archived: true, updatedAt: true }
    });

    return reply.send(updated);
  });
}
