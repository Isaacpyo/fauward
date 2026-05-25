export type AgentEventType =
  | 'shipment_created'
  | 'status_changed'
  | 'sla_check'
  | 'failed_delivery'
  | 'nl_query'
  | 'sweep';

export const agentConfig = {
  reasoningEffort: (process.env.AGENT_REASONING_EFFORT ?? 'high') as 'low' | 'high' | 'max',
  maxIterations: Number(process.env.AGENT_MAX_ITERATIONS ?? 15),
  requestTimeoutMs: Number(process.env.AGENT_REQUEST_TIMEOUT_MS ?? 120_000),
  maxParallelTools: Number(process.env.AGENT_MAX_PARALLEL_TOOLS ?? 8),
  serviceToken: process.env.AGENT_SERVICE_TOKEN,
  temperature: 1.0,
  topP: 1.0,
  maxTokens: 4096
} as const;

export function selectAgentTask(eventType: AgentEventType): string {
  switch (eventType) {
    case 'nl_query':
    case 'status_changed':
      return 'address_cleanup';
    case 'shipment_created':
      return 'driver_assignment';
    case 'failed_delivery':
      return 'tracking_exception_analysis';
    case 'sla_check':
      return 'sla_risk_explanation';
    case 'sweep':
      return 'tracking_exception_analysis';
    default:
      return 'tracking_exception_analysis';
  }
}

export function selectReasoningEffort(eventType: AgentEventType): 'low' | 'high' | 'max' {
  switch (eventType) {
    case 'nl_query':
    case 'status_changed':
      return 'low';
    default:
      return agentConfig.reasoningEffort;
  }
}
