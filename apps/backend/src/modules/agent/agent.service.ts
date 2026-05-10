import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { z } from 'zod';

import { selectAgentTask } from './agent.config.js';
import { AgentEventSchema } from './agent.schemas.js';
import type { ToolName } from './agent.tools.js';
import type { ToolHandler } from './agent.handlers.js';
import type { AgentEvent, AgentRunResult } from './agent.types.js';
import { LLMGatewayService } from '../../shared/services/llm-gateway.service.js';

export type { AgentEvent, AgentRunResult };

const logger = pino({ name: 'fauward-agent' });
const processedEventIds = new Set<string>();

const AgentGatewayOutputSchema = z.object({
  confidence: z.number(),
  finalMessage: z.string(),
  recommendedActions: z.array(z.string()).default([])
});

export async function runAgent(
  event: AgentEvent,
  _toolHandlers: Record<ToolName, ToolHandler>,
  prisma?: unknown
): Promise<AgentRunResult> {
  const runStart = Date.now();
  AgentEventSchema.parse(event);

  if (processedEventIds.has(event.eventId)) {
    return {
      status: 'already_processed',
      eventId: event.eventId,
      tenantId: event.tenantId,
      shipmentId: event.shipmentId,
      actions: [],
      durationMs: Date.now() - runStart
    };
  }

  try {
    if (!prisma) {
      throw new Error('Prisma client is required for gateway-backed agent runs');
    }

    const gateway = new LLMGatewayService(prisma as any);
    const result = await gateway.run({
      task: selectAgentTask(event.type),
      tenantId: event.tenantId,
      input: {
        event,
        runId: randomUUID()
      },
      outputSchema: AgentGatewayOutputSchema,
      allowAutoAction: false
    });

    const recommendedActions = result.result.recommendedActions ?? [];

    processedEventIds.add(event.eventId);
    return {
      status: result.confidence >= 0.85 ? 'requires_approval' : 'completed',
      eventId: event.eventId,
      tenantId: event.tenantId,
      shipmentId: event.shipmentId,
      actions: recommendedActions.map((summary) => ({
        tool: 'llm_recommendation',
        decision: 'requires_approval',
        executed: false,
        summary
      })),
      finalMessage: result.result.finalMessage,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: result.tokensUsed },
      durationMs: Date.now() - runStart
    };
  } catch (err) {
    logger.error({ err, eventId: event.eventId }, 'agent run failed');
    return {
      status: 'failed',
      eventId: event.eventId,
      tenantId: event.tenantId,
      shipmentId: event.shipmentId,
      actions: [],
      finalMessage: err instanceof Error ? err.message : 'Agent run failed',
      durationMs: Date.now() - runStart
    };
  }
}
