import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { QueueTable } from "@/components/admin/QueueTable";
import type { QueueRow } from "@/components/admin/QueueTable";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { consoleApi as api } from "@/lib/console-api";

type QueueStatsResponse = {
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }>;
};

async function fetchQueues() {
  const response = await api.get<QueueStatsResponse>("/queues");
  return response.data;
}

export function QueuesListPage() {
  const query = useQuery({
    queryKey: ["admin-queues"],
    queryFn: fetchQueues,
    refetchInterval: 10_000
  });

  const queueRows = useMemo<QueueRow[]>(() => {
    return (query.data?.queues ?? []).map((queue) => ({
      name: queue.name,
      depth: queue.waiting,
      processingRate: `${queue.active}/s`,
      dlqDepth: queue.failed,
      oldestAge: "n/a",
      status: queue.failed > 0 ? "critical" : queue.waiting > 200 ? "warning" : "healthy"
    }));
  }, [query.data]);

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Queue Monitoring</h1>
      <QueueTable rows={queueRows} />
      <DegradedBanner variant="not-wired" fixedBy="WP-3.6">
        Inspecting individual jobs (failed, waiting, delayed) needs the queue jobs endpoint, which arrives with queue operations in Phase 3.
      </DegradedBanner>
    </div>
  );
}
