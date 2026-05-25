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

export async function fetchAgentActions(
  status: AgentActionStatus = "PENDING_APPROVAL",
  page = 1,
  limit = 20
): Promise<AgentActionListResponse> {
  const res = await api.get<AgentActionListResponse>("/v1/agent/actions", {
    params: { status, page, limit }
  });
  return res.data;
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

export function useAgentActions(status: AgentActionStatus = "PENDING_APPROVAL", page = 1, limit = 20) {
  return useQuery({
    queryKey: ["agent-actions", status, page, limit],
    queryFn: () => fetchAgentActions(status, page, limit)
  });
}

export function useApproveAgentAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveAgentAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-actions"] });
    }
  });
}

export function useRejectAgentAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rejectAgentAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-actions"] });
    }
  });
}
