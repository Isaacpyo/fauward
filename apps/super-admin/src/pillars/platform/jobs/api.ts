import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// platform.jobs (WP-3.8): registered scheduled jobs, their ScheduledJobRun history, and a dangerous manual trigger.

export type JobRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";

export type JobRun = {
  id: string;
  jobName: string;
  bullJobId: string | null;
  status: JobRunStatus;
  /** "SCHEDULE" or the PlatformUser id that triggered the run. */
  triggeredBy: string;
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  result: unknown;
};

export type ScheduledJob = {
  name: string;
  pattern: string;
  description: string;
  timeoutMs: number;
  /** Null when the BullMQ schedule could not be read. */
  scheduled: boolean | null;
  nextRunAt: string | null;
  lastRun: JobRun | null;
};

export const JOBS_KEY = ["platform.jobs"] as const;

export function useJobs() {
  return useQuery({
    queryKey: [...JOBS_KEY, "list"],
    queryFn: async () => (await consoleApi.get<{ data: ScheduledJob[]; scheduleReadable: boolean }>("/jobs")).data,
    refetchInterval: 30_000
  });
}

export function useJobRuns(name: string) {
  return useInfiniteQuery({
    queryKey: [...JOBS_KEY, "runs", name],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<{ data: JobRun[]; nextCursor: string | null }>(`/jobs/${encodeURIComponent(name)}/runs`, { params: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 10_000
  });
}

export function useTriggerJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, reason }: { name: string; reason: string }) =>
      (await consoleApi.post<{ jobName: string; bullJobId: string; queued: true }>(`/jobs/${encodeURIComponent(name)}/trigger`, { reason })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JOBS_KEY })
  });
}

export const runStatusTone: Record<JobRunStatus, string> = {
  RUNNING: "border-blue-200 bg-blue-50 text-blue-800",
  SUCCEEDED: "border-green-200 bg-green-50 text-green-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  TIMED_OUT: "border-amber-200 bg-amber-50 text-amber-800"
};

export function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1_000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1_000)} s`;
}
