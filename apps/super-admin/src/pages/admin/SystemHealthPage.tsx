import { useQuery } from "@tanstack/react-query";

import { SystemMetrics } from "@/components/admin/SystemMetrics";
import { api } from "@/lib/api";

type HealthPayload = {
  dbLatencyMs: number;
  redisLatencyMs: number;
  uptimeSeconds: number;
};

async function fetchHealth() {
  const response = await api.get<HealthPayload>("/admin/health");
  return response.data;
}

export function SystemHealthPage() {
  const query = useQuery({
    queryKey: ["admin-health"],
    queryFn: fetchHealth,
    refetchInterval: 15_000
  });

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">System Health</h1>
      <SystemMetrics
        dbLatencyMs={query.data?.dbLatencyMs}
        redisLatencyMs={query.data?.redisLatencyMs}
        uptimeSeconds={query.data?.uptimeSeconds}
      />
    </div>
  );
}
