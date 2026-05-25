import { useMutation, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { api } from "@/lib/api";

export type SweepStage = "queued" | "scanning" | "flagged" | "proposing" | "complete" | "failed";
export type SweepRunStatus = "RUNNING" | "COMPLETED" | "FAILED";

export type SweepRun = {
  id: string;
  status: SweepRunStatus;
  stage: SweepStage | null;
  scannedCount: number;
  flaggedCount: number;
  proposedCount: number;
  finishedAt: string | null;
  output: Record<string, unknown> | null;
};

export type StartSweepError = {
  status: number;
  code: "RATE_LIMITED" | "BUDGET_EXCEEDED" | "FEATURE_DISABLED" | "UNKNOWN";
  message: string;
  retryAfterSeconds?: number;
};

export async function startSweep(): Promise<{ runId: string }> {
  const res = await api.post<{ runId: string }>("/v1/agent/run");
  return res.data;
}

export async function fetchSweepProgress(runId: string): Promise<SweepRun> {
  const res = await api.get<SweepRun>(`/v1/agent/run/${runId}`);
  return res.data;
}

function classifyStartError(err: unknown): StartSweepError {
  if (err instanceof AxiosError && err.response) {
    const status = err.response.status;
    const data = (err.response.data ?? {}) as { error?: string; message?: string; code?: string };
    const message = data.message ?? data.error ?? err.message;
    if (status === 429) {
      const retryAfter = err.response.headers?.["retry-after"];
      return {
        status,
        code: "RATE_LIMITED",
        message: "Another sweep ran recently. Try again in 5 minutes.",
        retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined
      };
    }
    if (status === 402) {
      return {
        status,
        code: "BUDGET_EXCEEDED",
        message: "Plan limit reached. Upgrade to run another sweep."
      };
    }
    if (status === 403) {
      return {
        status,
        code: "FEATURE_DISABLED",
        message: "Fauward Agent is not enabled on this plan."
      };
    }
    return { status, code: "UNKNOWN", message };
  }
  return { status: 0, code: "UNKNOWN", message: err instanceof Error ? err.message : "Could not start sweep" };
}

export function useStartSweep() {
  return useMutation<{ runId: string }, StartSweepError>({
    mutationFn: async () => {
      try {
        return await startSweep();
      } catch (err) {
        throw classifyStartError(err);
      }
    }
  });
}

export function useSweepProgress(runId: string | null) {
  return useQuery({
    queryKey: ["sweep-progress", runId],
    queryFn: () => (runId ? fetchSweepProgress(runId) : Promise.reject(new Error("no runId"))),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const data = query.state.data as SweepRun | undefined;
      return data && data.status === "RUNNING" ? 1000 : false;
    }
  });
}
