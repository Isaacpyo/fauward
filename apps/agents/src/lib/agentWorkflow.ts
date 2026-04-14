export const AGENT_STATUS_FLOW = [
  "PENDING",
  "PROCESSING",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
] as const;

export type AgentShipmentStatus = (typeof AGENT_STATUS_FLOW)[number];

export function isAgentStatus(status: string): status is AgentShipmentStatus {
  return (AGENT_STATUS_FLOW as readonly string[]).includes(status);
}

export function getNextAgentStatus(status: string): AgentShipmentStatus | null {
  if (!isAgentStatus(status)) return null;
  const idx = AGENT_STATUS_FLOW.indexOf(status);
  if (idx === -1 || idx >= AGENT_STATUS_FLOW.length - 1) return null;
  return AGENT_STATUS_FLOW[idx + 1];
}

export function formatAgentStatus(status: string): string {
  return status.replaceAll("_", " ");
}