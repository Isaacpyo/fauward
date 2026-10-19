import { randomUUID } from 'node:crypto';
import pino from 'pino';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { LLMGatewayService } from '../../shared/services/llm-gateway.service.js';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { requireFeature } from '../../shared/middleware/featureGuard.js';
import { buildToolHandlers } from './agent.handlers.impl.js';
import { tools as agentTools, type ToolName } from './agent.tools.js';
import { buildAskSystemPrompt, CANNOT_ANSWER_MESSAGE } from './agent.prompts.js';
import { deriveTitle } from './agent.conversations.js';
import type { HandlerContext } from './agent.handlers.js';

const logger = pino({ name: 'fauward-agent-ask' });

// How many prior messages to replay as context. ~6 turns. Bounds token cost.
const HISTORY_LIMIT = 12;
// Prior assistant answers can be long; truncate when replaying as history.
const HISTORY_CONTENT_MAX = 500;

interface HistoryTurn {
  role: string;
  content: string;
}

const READ_ONLY_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  'get_failed_shipments_count',
  'get_delay_reasons',
  'get_sla_breach_rate',
  'get_driver_performance',
  'get_carrier_performance',
  'get_shipments_by_status',
  'get_weekly_operations_summary',
  'get_shipment_details',
  'get_available_drivers'
]);

const AskBodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  conversationId: z.string().optional() // absent => create a new thread
});

const AskRoundOneOutput = z.object({
  content: z.string().nullable().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({ name: z.string(), arguments: z.string() })
      })
    )
    .optional()
});

const AskRoundTwoOutput = z.object({
  answer: z.string()
});

type AskStatus = 'answered' | 'cannot_answer' | 'error';

interface ToolInvocation {
  name: ToolName;
  args: Record<string, unknown>;
  result: unknown;
}

function askRateLimitKey(req: FastifyRequest): string {
  const tenantId = req.tenant?.id;
  return `agent-ask:${tenantId ?? req.ip}`;
}

/**
 * Resolve an existing tenant-scoped conversation or create a fresh one.
 * Returns null when a conversationId was supplied but does not belong to this tenant
 * (caller turns that into a 404 — never leak another tenant's thread).
 */
async function resolveOrCreateConversation(
  app: FastifyInstance,
  tenantId: string,
  userId: string,
  conversationId: string | undefined,
  question: string
): Promise<{ id: string } | null> {
  if (conversationId) {
    const existing = await app.prisma.agentConversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { id: true }
    });
    return existing ?? null;
  }
  return app.prisma.agentConversation.create({
    data: { tenantId, createdBy: userId, title: deriveTitle(question) },
    select: { id: true }
  });
}

/** Load the last N prior messages (chronological), trimmed for replay as context. */
async function loadHistory(
  app: FastifyInstance,
  tenantId: string,
  conversationId: string
): Promise<HistoryTurn[]> {
  const recent = await app.prisma.agentMessage.findMany({
    where: { tenantId, conversationId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { role: true, content: true }
  });
  return recent
    .reverse()
    .map((m) => ({ role: m.role, content: m.content.slice(0, HISTORY_CONTENT_MAX) }));
}

export async function registerAgentAskRoute(app: FastifyInstance): Promise<void> {
  const preHandlers: unknown[] = [app.authenticate, requireTenantMatch, requireFeature('agent')];
  if (typeof (app as unknown as { rateLimit?: unknown }).rateLimit === 'function') {
    preHandlers.push(
      (app as unknown as { rateLimit: (opts: unknown) => unknown }).rateLimit({
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: askRateLimitKey
      })
    );
  }

  app.post(
    '/api/v1/agent/ask',
    { preHandler: preHandlers as never },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const parsed = AskBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid question', details: parsed.error.flatten() });
      }
      const { question, conversationId: requestedConversationId } = parsed.data;
      const userId = (request.user as { sub: string }).sub;

      // Resolve/create the thread before any LLM work so both the question and the answer
      // are persisted (and so a bad conversationId fails fast as a 404).
      const conversation = await resolveOrCreateConversation(
        app,
        tenantId,
        userId,
        requestedConversationId,
        question
      );
      if (!conversation) throw app.httpErrors.notFound('Conversation not found');
      const conversationId = conversation.id;

      // Load prior turns BEFORE persisting the new question, so history is prior-only.
      const history = await loadHistory(app, tenantId, conversationId);

      // Persist the user message immediately — it survives even if the LLM call fails.
      await app.prisma.agentMessage.create({
        data: { tenantId, conversationId, role: 'user', content: question }
      });

      const handlers = buildToolHandlers(app);
      const readOnlyTools = (agentTools as Array<{ function: { name: string } }>).filter((t) =>
        READ_ONLY_TOOLS.has(t.function.name as ToolName)
      );
      const systemPrompt = buildAskSystemPrompt(tenantId, { hasHistory: history.length > 0 });
      const gateway = new LLMGatewayService(app.prisma);
      const handlerCtx: HandlerContext = {
        runId: randomUUID(),
        tenantId,
        logger: { info: logger.info.bind(logger), error: logger.error.bind(logger) }
      };

      // Persist the assistant turn (bumping conversation.updatedAt via the nested write) and
      // return the response. Every exit path goes through here so nothing is lost.
      const finish = async (payload: {
        answer: string;
        toolsUsed: ToolInvocation[];
        status: AskStatus;
      }) => {
        try {
          await app.prisma.agentConversation.update({
            where: { id: conversationId },
            data: {
              messages: {
                create: {
                  tenantId,
                  role: 'assistant',
                  content: payload.answer,
                  status: payload.status,
                  toolsUsed: payload.toolsUsed as unknown as object
                }
              }
            }
          });
        } catch (persistErr) {
          request.log.error({ persistErr, conversationId }, 'failed to persist assistant message');
        }
        return reply.send({ conversationId, ...payload });
      };

      try {
        const round1 = await gateway.run({
          task: 'agent_ask',
          tenantId,
          input: history.length > 0 ? { question, history } : { question },
          outputSchema: AskRoundOneOutput,
          tools: readOnlyTools as unknown as Array<{
            type: 'function';
            function: { name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean };
          }>,
          systemPrompt,
          allowAutoAction: false
        });

        const rawToolCalls = round1.result.tool_calls ?? [];
        const directContent = round1.result.content?.trim() ?? '';

        if (rawToolCalls.length === 0) {
          // Honest fallback: no tool was called. We never echo a fabricated answer.
          return finish({
            answer: directContent || CANNOT_ANSWER_MESSAGE,
            toolsUsed: [],
            status: 'cannot_answer'
          });
        }

        const invocations: ToolInvocation[] = [];
        for (const call of rawToolCalls) {
          const name = call.function.name as ToolName;
          if (!READ_ONLY_TOOLS.has(name)) {
            logger.warn({ tenantId, attempted: name }, 'ask refused non-read-only tool');
            return finish({ answer: CANNOT_ANSWER_MESSAGE, toolsUsed: [], status: 'cannot_answer' });
          }

          let args: Record<string, unknown>;
          try {
            args = JSON.parse(call.function.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }
          args.tenantId = tenantId; // Always force tenantId from auth — never trust the model.

          const handler = handlers[name];
          if (!handler) {
            return finish({ answer: CANNOT_ANSWER_MESSAGE, toolsUsed: [], status: 'cannot_answer' });
          }

          const result = await handler(args, handlerCtx);
          invocations.push({ name, args, result });
        }

        // Round 2: ask the model to phrase a short natural-language answer from the tool
        // results. No tools passed — this round cannot trigger another tool call.
        const round2 = await gateway.run({
          task: 'agent_ask',
          tenantId,
          input: {
            question,
            toolResults: invocations.map((inv) => ({ name: inv.name, result: inv.result }))
          },
          outputSchema: AskRoundTwoOutput,
          systemPrompt:
            systemPrompt +
            '\n\nThis turn the tools have already run. Respond with ONLY a JSON object of the form {"answer": "<your one or two sentence answer using the toolResults>"}.',
          allowAutoAction: false
        });

        return finish({
          answer: round2.result.answer.trim() || CANNOT_ANSWER_MESSAGE,
          toolsUsed: invocations,
          status: 'answered'
        });
      } catch (err) {
        request.log.error({ err, tenantId }, 'agent ask failed');
        return finish({
          answer: 'Something went wrong while answering your question. Please try again.',
          toolsUsed: [],
          status: 'error'
        });
      }
    }
  );
}
