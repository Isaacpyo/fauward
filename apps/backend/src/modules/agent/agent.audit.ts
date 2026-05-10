import { randomUUID } from 'node:crypto';
import pino from 'pino';

import type { PolicyDecision, AgentRunStatus, AgentEvent, AgentRunResult } from './agent.types.js';

const logger = pino({ name: 'fauward-agent-audit' });

export interface AgentAuditRecord {
  runId: string;
  eventId?: string;
  tenantId: string;
  shipmentId?: string;
  eventType: string;
  actions: Array<{
    tool: string;
    policyDecision: PolicyDecision;
    executed: boolean;
    argumentsSummary: string;
    resultSummary: string;
    durationMs: number;
    error?: string;
  }>;
  status: AgentRunStatus;
  finalMessage?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  durationMs: number;
  createdAt: Date;
}

export async function persistAgentRun(event: AgentEvent, result: AgentRunResult): Promise<void> {
  const record: AgentAuditRecord = {
    runId: randomUUID(),
    eventId: event.eventId,
    tenantId: event.tenantId,
    shipmentId: event.shipmentId,
    eventType: event.type,
    actions: result.actions.map((action) => ({
      tool: action.tool,
      policyDecision: action.decision,
      executed: action.executed,
      // summary contains argument keys only — no PII values
      argumentsSummary: action.summary,
      resultSummary: action.executed ? 'executed' : action.decision,
      durationMs: action.durationMs ?? 0,
      error: action.error
    })),
    status: result.status,
    finalMessage: result.finalMessage,
    usage: result.usage,
    durationMs: result.durationMs ?? 0,
    createdAt: new Date()
  };

  // TODO: persist to agent_runs table — designed to power the Agent Activity tab
  // in the tenant portal and super admin console.
  logger.info(record, 'agent run audit');
}
