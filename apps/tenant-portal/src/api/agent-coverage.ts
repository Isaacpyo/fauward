import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { AgentAction } from "@/api/agent-actions";

export type CoverageKind =
  | "unassigned"
  | "failed_unhandled"
  | "past_deadline"
  | "at_risk_soon"
  | "stuck"
  | "overloaded_driver";

export type CoverageGroup = {
  kind: CoverageKind;
  label: string;
  actionable: boolean;
  items: AgentAction[];
};

export type AgentCoverage = {
  groups: CoverageGroup[];
  onTrack: number;
  lastRunAt: string | null;
};

export async function fetchAgentCoverage(): Promise<AgentCoverage> {
  const res = await api.get<AgentCoverage>("/v1/agent/coverage");
  return res.data;
}

export function useAgentCoverage() {
  return useQuery({
    queryKey: ["agent-coverage"],
    queryFn: fetchAgentCoverage
  });
}

export function useInvalidateCoverage() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["agent-coverage"] });
}
