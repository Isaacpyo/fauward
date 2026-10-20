import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// platform.queues (WP-3.6): live BullMQ counts, redacted job inspection, DLQ replay, clean and pause/resume.

export type QueueSummary = {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  completed1h: number;
  failed1h: number;
  /** Null when the queue has no dead-letter queue. */
  dlqDepth: number | null;
  throughputPerMin: number;
  lastProcessedAt: string | null;
  paused: boolean;
};

export type QueueJobState = "waiting" | "active" | "delayed" | "completed" | "failed" | "dlq";

export type QueueJob = {
  id: string;
  name: string;
  state: QueueJobState;
  attemptsMade: number;
  failedReason: string | null;
  createdAt: string;
  processedAt: string | null;
  finishedAt: string | null;
  data: unknown;
};

export const QUEUES_KEY = ["platform.queues"] as const;

export function useQueues() {
  return useQuery({
    queryKey: [...QUEUES_KEY, "list"],
    queryFn: async () => (await consoleApi.get<{ queues: QueueSummary[]; asOf: string }>("/queues")).data,
    refetchInterval: 10_000
  });
}

export function useQueueJobs(name: string, state: QueueJobState) {
  return useInfiniteQuery({
    queryKey: [...QUEUES_KEY, "jobs", name, state],
    initialPageParam: "0",
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<{ data: QueueJob[]; nextCursor: string | null }>(`/queues/${encodeURIComponent(name)}/jobs`, { params: { state, cursor: pageParam } })).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined
  });
}

function useQueueMutation<TInput, TResult>(path: (name: string) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, ...body }: TInput & { name: string; reason: string }) => (await consoleApi.post<TResult>(path(name), body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUEUES_KEY })
  });
}

export function useReplayDlq() {
  return useQueueMutation<{ jobIds?: string[] }, { requested: number; replayed: number; missing: string[] }>((name) => `/queues/${encodeURIComponent(name)}/dlq/replay`);
}

export function useCleanQueue() {
  return useQueueMutation<{ state: "completed" | "failed"; olderThanHours: number }, { removed: number; state: string; olderThanHours: number }>(
    (name) => `/queues/${encodeURIComponent(name)}/clean`
  );
}

export function usePauseQueue(verb: "pause" | "resume") {
  return useQueueMutation<object, { name: string; paused: boolean }>((name) => `/queues/${encodeURIComponent(name)}/${verb}`);
}
