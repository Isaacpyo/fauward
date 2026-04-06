import { useMemo } from "react";

import { Badge } from "@/components/ui/Badge";
import { useDriverStore } from "@/stores/useDriverStore";

export function HistoryPage() {
  const history = useDriverStore((state) => state.history);

  const grouped = useMemo(() => {
    return history.reduce<Record<string, typeof history>>((acc, item) => {
      const day = new Date(item.time).toDateString();
      acc[day] = acc[day] ? [...acc[day], item] : [item];
      return acc;
    }, {});
  }, [history]);

  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-lg font-semibold text-gray-900">History</h1>
      {Object.entries(grouped).map(([day, items]) => (
        <section key={day} className="rounded-xl border border-[var(--border-color)] bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-800">{day}</h2>
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] p-3">
                <div>
                  <p className="mono text-sm font-semibold text-gray-900">{item.trackingNumber}</p>
                  <p className="text-sm text-gray-700">{item.customer}</p>
                  <p className="text-xs text-gray-500">{new Date(item.time).toLocaleTimeString()}</p>
                </div>
                <Badge tone={item.status === "DELIVERED" ? "success" : "danger"}>{item.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

