import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Shipment = {
  id: string;
  trackingNumber: string;
  status: string;
  assignedDriverId?: string | null;
  driver?: {
    id: string;
    user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  } | null;
};

type DriverGroup = {
  key: string;
  driverName: string;
  rows: Shipment[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchDispatchRows(date: string) {
  const statuses = ["PROCESSING", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].join(",");
  const response = await api.get<{ data: Shipment[] }>(`/v1/shipments?status=${statuses}&dateFrom=${date}&dateTo=${date}`);
  return response.data.data;
}

export function DispatchPage() {
  const [date, setDate] = useState(todayIso());

  const query = useQuery({
    queryKey: ["dispatch", date],
    queryFn: () => fetchDispatchRows(date),
    refetchInterval: 60_000
  });

  const groups = useMemo<DriverGroup[]>(() => {
    const rows = query.data ?? [];
    const byDriver = new Map<string, DriverGroup>();

    for (const row of rows) {
      const driverId = row.assignedDriverId ?? "unassigned";
      const driverName = row.driver
        ? [row.driver.user?.firstName, row.driver.user?.lastName].filter(Boolean).join(" ") ||
          row.driver.user?.email ||
          "Assigned Driver"
        : "Unassigned";

      if (!byDriver.has(driverId)) {
        byDriver.set(driverId, {
          key: driverId,
          driverName,
          rows: []
        });
      }
      byDriver.get(driverId)!.rows.push(row);
    }

    return [...byDriver.values()].sort((a, b) => {
      if (a.key === "unassigned") return -1;
      if (b.key === "unassigned") return 1;
      return a.driverName.localeCompare(b.driverName);
    });
  }, [query.data]);

  return (
    <PageShell title="Dispatch Board" description="Operational view of active shipments grouped by driver.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="max-w-[220px]" />
          <Button type="button" variant="secondary" onClick={() => query.refetch()}>
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => {
            const stopCount = group.rows.length;
            const delivered = group.rows.filter((row) => row.status === "DELIVERED").length;
            const progressPct = stopCount > 0 ? Math.round((delivered / stopCount) * 100) : 0;
            const capacityWarning = stopCount > 20;

            return (
              <section key={group.key} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{group.driverName}</h3>
                  {capacityWarning ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                      Capacity warning
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-gray-500">Stops: {stopCount}</p>
                <div className="mt-3 h-2 w-full rounded-full bg-gray-200">
                  <div className="h-2 rounded-full bg-[var(--tenant-primary)]" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="mt-3 space-y-2">
                  {group.rows.map((row) => (
                    <div key={row.id} className="rounded-md border border-gray-200 p-2 text-xs">
                      <div className="font-mono text-gray-900">{row.trackingNumber}</div>
                      <div className="text-gray-600">{row.status}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
