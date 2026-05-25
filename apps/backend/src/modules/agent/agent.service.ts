import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { z } from 'zod';

import { selectAgentTask } from './agent.config.js';
import { AgentEventSchema } from './agent.schemas.js';
import { tools as agentTools } from './agent.tools.js';
import { buildSystemPrompt } from './agent.prompts.js';
import { evaluatePolicy } from './agent.policy.js';
import type { PolicyContext, PolicyDecision } from './agent.types.js';
import type { ToolName } from './agent.tools.js';
import type { ToolHandler, HandlerContext } from './agent.handlers.js';
import type { AgentEvent, AgentRunResult, ActionRecord } from './agent.types.js';
import { LLMGatewayService } from '../../shared/services/llm-gateway.service.js';

export type { AgentEvent, AgentRunResult };

const logger = pino({ name: 'fauward-agent' });

const AgentToolOutputSchema = z.object({
  content: z.string().nullable().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          arguments: z.string()
        })
      })
    )
    .optional()
});

export async function runAgent(
  event: AgentEvent,
  toolHandlers: Record<ToolName, ToolHandler>,
  prisma?: unknown,
  redis?: any
): Promise<AgentRunResult> {
  const runStart = Date.now();
  AgentEventSchema.parse(event);

  if (redis) {
    const key = `agent:event:${event.eventId}`;
    const acquired = await redis.set(key, '1', 'NX', 'EX', 86400);
    if (acquired !== 'OK') {
      return {
        status: 'already_processed',
        eventId: event.eventId,
        tenantId: event.tenantId,
        shipmentId: event.shipmentId,
        actions: [],
        durationMs: Date.now() - runStart
      };
    }
  }

  try {
    if (!prisma) {
      throw new Error('Prisma client is required for gateway-backed agent runs');
    }

    const prismaClient = prisma as any;
    const gateway = new LLMGatewayService(prismaClient);
    const result = await gateway.run({
      task: selectAgentTask(event.type),
      tenantId: event.tenantId,
      input: {
        event,
        runId: randomUUID()
      },
      outputSchema: AgentToolOutputSchema,
      tools: agentTools as unknown as Array<{
        type: 'function';
        function: { name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean };
      }>,
      systemPrompt: buildSystemPrompt(event.tenantId),
      allowAutoAction: false
    });

    const toolCalls = result.result.tool_calls ?? [];
    logger.info({ eventId: event.eventId, toolCount: toolCalls.length }, 'agent proposed tools');

    const actions: ActionRecord[] = [];

    for (const tc of toolCalls) {
      const toolName = tc.function.name as ToolName;
      const payload: Record<string, unknown> = JSON.parse(tc.function.arguments);

      // Enforce tenantId from auth context, never from LLM payload
      payload.tenantId = event.tenantId;

      const policyCtx = await buildPolicyContext(toolName, payload, event, prismaClient);
      const decision: PolicyDecision = evaluatePolicy(toolName, policyCtx);

      if (decision === 'auto_approved') {
        const actionRecord = await executeSafeAction({
          toolName,
          payload,
          event,
          runId: result.runId,
          toolHandlers,
          prismaClient
        });
        actions.push(actionRecord);
      } else if (decision === 'requires_approval') {
        await prismaClient.agentAction.create({
          data: {
            tenantId: event.tenantId,
            runId: result.runId ?? null,
            type: toolName,
            payload: payload as any,
            risk: decision,
            status: 'PENDING_APPROVAL'
          }
        });
        actions.push({
          tool: toolName,
          decision,
          executed: false,
          summary: `${toolName} pending approval`
        });
      } else {
        // blocked or unclassified
        await prismaClient.agentAction.create({
          data: {
            tenantId: event.tenantId,
            runId: result.runId ?? null,
            type: toolName,
            payload: payload as any,
            risk: decision,
            status: 'REJECTED'
          }
        });
        actions.push({
          tool: toolName,
          decision,
          executed: false,
          summary: `${toolName} blocked by policy`
        });
      }
    }

    return {
      status: 'completed',
      eventId: event.eventId,
      tenantId: event.tenantId,
      shipmentId: event.shipmentId,
      actions,
      finalMessage: result.result.content ?? `Proposed ${toolCalls.length} action(s)`,
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

async function buildPolicyContext(
  toolName: ToolName,
  payload: Record<string, unknown>,
  event: AgentEvent,
  prismaClient: any
): Promise<PolicyContext> {
  const ctx: PolicyContext = {
    tenantId: event.tenantId,
    requestingTenantId: event.tenantId
  };

  const shipmentId =
    (payload.shipmentId as string | undefined) ?? event.shipmentId;

  if (
    shipmentId &&
    (
      toolName === 'assign_shipment' ||
      toolName === 'reroute_shipment' ||
      toolName === 'flag_sla_risk' ||
      toolName === 'send_customer_notification' ||
      toolName === 'get_shipment_details'
    )
  ) {
    const shipment = await prismaClient.shipment.findFirst({
      where: { id: shipmentId, tenantId: event.tenantId },
      select: { assignedDriverId: true, status: true }
    });
    if (shipment) {
      ctx.shipmentCurrentDriverId = shipment.assignedDriverId;
      ctx.shipmentStatus = shipment.status;
    }
  }

  return ctx;
}

interface ExecuteSafeActionArgs {
  toolName: ToolName;
  payload: Record<string, unknown>;
  event: AgentEvent;
  runId: string | null;
  toolHandlers: Record<ToolName, ToolHandler>;
  prismaClient: any;
}

async function executeSafeAction(args: ExecuteSafeActionArgs): Promise<ActionRecord> {
  const { toolName, payload, event, runId, toolHandlers, prismaClient } = args;
  const handler = toolHandlers[toolName];

  if (!handler) {
    await prismaClient.agentAction.create({
      data: {
        tenantId: event.tenantId,
        runId: runId ?? null,
        type: toolName,
        payload: payload as any,
        risk: 'auto_approved',
        status: 'FAILED',
        error: `Handler not found for tool: ${toolName}`
      }
    });
    return {
      tool: toolName,
      decision: 'auto_approved',
      executed: false,
      summary: `Handler not found for tool: ${toolName}`,
      error: `Handler not found for tool: ${toolName}`
    };
  }

  try {
    const handlerCtx: HandlerContext = {
      runId: runId ?? 'unknown',
      tenantId: event.tenantId,
      logger: { info: logger.info.bind(logger), error: logger.error.bind(logger) }
    };

    const handlerResult = await handler(payload, handlerCtx);

    await prismaClient.agentAction.create({
      data: {
        tenantId: event.tenantId,
        runId: runId ?? null,
        type: toolName,
        payload: payload as any,
        risk: 'auto_approved',
        status: 'AUTO_APPLIED',
        result: handlerResult as any,
        appliedAt: new Date()
      }
    });

    return {
      tool: toolName,
      decision: 'auto_approved',
      executed: true,
      summary: `${toolName} executed`
    };
  } catch (handlerErr) {
    const errorMessage = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);

    await prismaClient.agentAction.create({
      data: {
        tenantId: event.tenantId,
        runId: runId ?? null,
        type: toolName,
        payload: payload as any,
        risk: 'auto_approved',
        status: 'FAILED',
        error: errorMessage
      }
    });

    return {
      tool: toolName,
      decision: 'auto_approved',
      executed: false,
      summary: `Failed: ${errorMessage}`,
      error: errorMessage
    };
  }
}
