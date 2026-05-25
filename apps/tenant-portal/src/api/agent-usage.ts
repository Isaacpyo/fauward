import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export type AgentUsage = {
  month: string;
  actions: {
    total: number;
    autoApplied: number;
    approved: number;
    autoHandledPct: number | null;
    byType: Array<{ type: string; count: number }>;
  };
  ai: {
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
  };
  limit: {
    monthlyBudgetUsd: number | null;
    flashRequestLimit: number | null;
    proRequestLimit: number | null;
    featuresEnabled: string[];
  } | null;
};

export async function fetchAgentUsage(): Promise<AgentUsage> {
  const res = await api.get<AgentUsage>("/v1/agent/usage");
  return res.data;
}

export function useAgentUsage() {
  return useQuery({
    queryKey: ["agent-usage"],
    queryFn: fetchAgentUsage
  });
}
