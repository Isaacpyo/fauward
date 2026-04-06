import { Circle } from "lucide-react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn, formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentTimelineEvent as ShipmentTimelineEventModel } from "@/types/shipment";

type ShipmentTimelineEventProps = {
  event: ShipmentTimelineEventModel;
  isLatest: boolean;
};

export function ShipmentTimelineEvent({ event, isLatest }: ShipmentTimelineEventProps) {
  const tenant = useTenantStore((state) => state.tenant);

  return (
    <article
      className={cn(
        "relative rounded-lg border border-gray-200 bg-white p-4",
        isLatest ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-light)]/40" : ""
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white",
            isLatest ? "h-6 w-6 border-[var(--tenant-primary)]" : ""
          )}
        >
          <Circle size={isLatest ? 10 : 8} fill={isLatest ? "var(--tenant-primary)" : "#9ca3af"} className="text-transparent" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} />
            <p className={cn("text-sm text-gray-700", isLatest ? "font-semibold text-gray-900" : "")}>
              {event.description}
            </p>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {formatDateTime(event.timestamp, tenant)} · {event.actor}
            {event.location ? ` · ${event.location}` : ""}
          </p>
          {event.note ? <p className="mt-2 text-sm text-gray-600">{event.note}</p> : null}
        </div>
      </div>
    </article>
  );
}
