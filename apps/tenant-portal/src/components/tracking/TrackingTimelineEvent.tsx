import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn, formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { TrackingEvent } from "@/types/tracking";

type TrackingTimelineEventProps = {
  event: TrackingEvent;
  isLatest: boolean;
};

export function TrackingTimelineEvent({ event, isLatest }: TrackingTimelineEventProps) {
  const tenant = useTenantStore((state) => state.tenant);

  return (
    <article
      className={cn(
        "relative rounded-lg border border-gray-200 bg-white p-4",
        isLatest ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-light)]/25" : ""
      )}
    >
      <div className="absolute left-2 top-6 h-[calc(100%-20px)] w-px bg-gray-200" />
      <div className="relative flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex h-3 w-3 rounded-full bg-gray-400",
            isLatest ? "h-4 w-4 bg-[var(--tenant-primary)]" : ""
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} />
            <p className={cn("text-sm text-gray-800", isLatest ? "font-semibold text-gray-900" : "")}>
              {event.description}
            </p>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {event.location ? `${event.location} · ` : ""}
            {formatDateTime(event.timestamp, tenant)}
          </p>
          {event.note ? <p className="mt-1 text-sm text-gray-600">{event.note}</p> : null}
        </div>
      </div>
    </article>
  );
}
