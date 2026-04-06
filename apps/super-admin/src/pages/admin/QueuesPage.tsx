import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { QueueMessageViewer } from "@/components/admin/QueueMessageViewer";
import { QueueTable } from "@/components/admin/QueueTable";
import type { QueueRow } from "@/components/admin/QueueTable";
import { api } from "@/lib/api";

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
  const response = await api.get<QueueStatsResponse>("/admin/queues");
  return response.data;
}

export function QueuesPage() {
  const [selectedQueue, setSelectedQueue] = useState<string | undefined>(undefined);

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
      <QueueTable rows={queueRows} onSelectQueue={setSelectedQueue} />
      <QueueMessageViewer queueName={selectedQueue} />
    </div>
  );
}
