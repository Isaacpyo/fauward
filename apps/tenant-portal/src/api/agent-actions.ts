import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type AgentActionStatus =
  | "PENDING_APPROVAL"
  | "AUTO_APPLIED"
  | "APPLIED"
  | "REJECTED"
  | "FAILED";

export type AgentAction = {
  id: string;
  tenantId: string;
  runId: string | null;
  type: string;
  payload: Record<string, unknown>;
  risk: string;
  status: AgentActionStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  approvedBy: string | null;
  appliedAt: string | null;
  createdAt: string;
};

export type AgentActionListResponse = {
  items: AgentAction[];
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type AgentActionStatusFilter = AgentActionStatus | AgentActionStatus[] | undefined;

export async function fetchAgentActions(
  status: AgentActionStatusFilter = "PENDING_APPROVAL",
  page = 1,
  limit = 20
): Promise<AgentActionListResponse> {
  const statusParam = Array.isArray(status) ? (status.length > 0 ? status.join(",") : undefined) : status;
  const res = await api.get<AgentActionListResponse>("/v1/agent/actions", {
    params: { ...(statusParam ? { status: statusParam } : {}), page, limit }
  });
  return res.data;
}

export type AgentActionSummary = {
  needsYou: number;
  flagged: number;
  doneToday: number;
  failed: number;
};

export async function fetchAgentActionSummary(): Promise<AgentActionSummary> {
  const res = await api.get<AgentActionSummary>("/v1/agent/actions/summary");
  return res.data;
}

export function useAgentActionSummary() {
  return useQuery({
    queryKey: ["agent-actions-summary"],
    queryFn: fetchAgentActionSummary
  });
}

export async function approveAgentAction(actionId: string) {
  const res = await api.post<{ success: boolean; result?: unknown }>(
    `/v1/agent/actions/${actionId}/approve`
  );
  return res.data;
}

export async function rejectAgentAction(actionId: string) {
  const res = await api.post<{ success: boolean }>(
    `/v1/agent/actions/${actionId}/reject`
  );
  return res.data;
}

export function useAgentActions(
  status: AgentActionStatusFilter = "PENDING_APPROVAL",
  page = 1,
  limit = 20
) {
  const key = Array.isArray(status) ? status.join(",") : (status ?? "all");
  return useQuery({
    queryKey: ["agent-actions", key, page, limit],
    queryFn: () => fetchAgentActions(status, page, limit)
  });
}

export function useApproveAgentAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveAgentAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-actions"] });
      queryClient.invalidateQueries({ queryKey: ["agent-actions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["agent-coverage"] });
    }
  });
}

export function useRejectAgentAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rejectAgentAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-actions"] });
      queryClient.invalidateQueries({ queryKey: ["agent-actions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["agent-coverage"] });
    }
  });
}
