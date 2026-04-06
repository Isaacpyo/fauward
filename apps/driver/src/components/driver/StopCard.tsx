import { Navigation, Phone } from "lucide-react";
import { Link } from "react-router-dom";

import type { RouteStop } from "@/stores/useDriverStore";

type StopCardProps = {
  stop: RouteStop;
};

export function StopCard({ stop }: StopCardProps) {
  const statusTone =
    stop.status === "completed"
      ? "bg-green-500"
      : stop.status === "failed"
        ? "bg-red-500"
        : "bg-amber-500";

  return (
    <article
      className={`rounded-xl border bg-white p-4 ${
        stop.current ? "border-[var(--tenant-primary)]" : "border-[var(--border-color)]"
      } ${stop.status === "failed" ? "border-l-4 border-l-red-500" : ""} ${stop.status === "completed" ? "opacity-70" : ""}`}
    >
      <Link to={`/route/stop/${stop.id}`} className="block">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-color)] text-base font-semibold">
            {stop.number}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${statusTone}`} />
              <h3 className="truncate text-base font-semibold text-gray-900">{stop.customerName}</h3>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-gray-600">{stop.address}</p>
            <p className="mt-2 inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
              {stop.shipmentCount} shipments
            </p>
          </div>
        </div>
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] text-sm font-semibold text-gray-700"
        >
          <Navigation size={16} />
          Navigate
        </a>
        <a href={`tel:${stop.phone}`} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] text-sm font-semibold text-gray-700">
          <Phone size={16} />
          Call
        </a>
      </div>
    </article>
  );
}

