export type AgentEventType =
  | 'shipment_created'
  | 'status_changed'
  | 'sla_check'
  | 'failed_delivery'
  | 'nl_query';

export type PolicyDecision = 'auto_approved' | 'requires_approval' | 'blocked';

export type AgentRunStatus =
  | 'completed'
  | 'requires_approval'
  | 'blocked'
  | 'already_processed'
  | 'failed';

export interface AgentEvent {
  eventId: string;
  type: AgentEventType;
  tenantId: string;
  shipmentId?: string;
  payload?: Record<string, unknown>;
}

export interface ActionRecord {
  tool: string;
  decision: PolicyDecision;
  executed: boolean;
  summary: string;
  durationMs?: number;
  error?: string;
}

export interface AgentRunResult {
  status: AgentRunStatus;
  eventId?: string;
  tenantId: string;
  shipmentId?: string;
  actions: ActionRecord[];
  finalMessage?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  durationMs?: number;
}
