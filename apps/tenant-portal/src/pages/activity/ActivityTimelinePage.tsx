import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type ActivityEntry = {
  id: string;
  type: "shipment" | "return" | "ticket" | "invoice" | "audit";
  title: string;
  subtitle: string;
  link: string;
  timestamp: string;
  icon: string;
  colour: string;
};

async function fetchActivity(timeframe: string, type: string) {
  const query = new URLSearchParams();
  query.set("timeframe", timeframe);
  if (type !== "all") query.set("type", type);
  const response = await api.get<{ entries: ActivityEntry[] }>(`/v1/activity?${query.toString()}`);
  return response.data.entries;
}

const timeframeOptions = ["1h", "24h", "7d", "30d"];
const typeOptions = ["all", "shipment", "return", "ticket", "invoice", "audit"];

export function ActivityTimelinePage() {
  const [timeframe, setTimeframe] = useState("24h");
  const [type, setType] = useState("all");

  const query = useQuery({
    queryKey: ["activity", timeframe, type],
    queryFn: () => fetchActivity(timeframe, type),
    refetchInterval: 60_000
  });

  const entries = query.data ?? [];

  return (
    <PageShell title="Activity" description="Live chronological stream across shipments, returns, tickets, and finance events.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {timeframeOptions.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={option === timeframe ? "primary" : "secondary"}
              onClick={() => setTimeframe(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {typeOptions.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={option === type ? "primary" : "secondary"}
              onClick={() => setType(option)}
            >
              {option === "all" ? "All" : `${option[0].toUpperCase()}${option.slice(1)}s`}
            </Button>
          ))}
        </div>

        {query.isLoading ? (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            {entries.map((entry) => (
              <div key={entry.id} className="relative border-l-2 border-gray-200 pl-4">
                <span className="absolute -left-[7px] top-1.5 inline-block h-3 w-3 rounded-full bg-[var(--tenant-primary)]" />
                <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                <p className="text-sm text-gray-600">{entry.subtitle}</p>
                <p className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString()}</p>
              </div>
            ))}
            {entries.length === 0 ? <p className="text-sm text-gray-500">No activity in this period.</p> : null}
          </div>
        )}
      </div>
    </PageShell>
  );
}

