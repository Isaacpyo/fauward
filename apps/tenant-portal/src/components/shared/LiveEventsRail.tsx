import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  Clock,
  FileText,
  type LucideIcon,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { Skeleton } from "@/components/ui/Skeleton";
import { fetchActivity, type ActivityEntry } from "@/lib/activity-feed";
import { toRelativeTime } from "@/lib/notification-display";

interface LiveEventsRailProps {
  /** Polling interval in ms — default 8_000. */
  refetchInterval?: number;
  /** Max rows rendered — default 12. */
  limit?: number;
  /** Optional className for the outer wrapper. */
  className?: string;
}

// Map the icon name strings the backend returns to lucide-react components.
// Falls back to a neutral bell if the backend ever returns a name we don't know.
const ICON_MAP: Record<string, LucideIcon> = {
  truck: Truck,
  shield: ShieldCheck,
  "rotate-ccw": RotateCcw,
  "message-square": MessageSquare,
  "file-text": FileText,
  bell: Bell,
};

// Map the backend's tailwind colour names to actual class strings. Kept in
// one place so we don't need dynamic Tailwind classes (which the JIT prunes).
const COLOUR_DOT: Record<string, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
  rose: "bg-rose-500",
};

const COLOUR_PING: Record<string, string> = {
  blue: "bg-blue-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  slate: "bg-slate-400",
  rose: "bg-rose-400",
};

const COLOUR_ICON: Record<string, string> = {
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  violet: "text-violet-600",
  slate: "text-slate-600",
  rose: "text-rose-600",
};

function dotClass(colour: string) {
  return COLOUR_DOT[colour] ?? "bg-gray-500";
}

function pingClass(colour: string) {
  return COLOUR_PING[colour] ?? "bg-gray-400";
}

function iconColourClass(colour: string) {
  return COLOUR_ICON[colour] ?? "text-gray-600";
}

type LiveStatus = "live" | "stale" | "offline";

function deriveStatus(updatedAt: number | undefined, isError: boolean, now: number): LiveStatus {
  if (isError) return "offline";
  if (!updatedAt) return "stale";
  const ageMs = now - updatedAt;
  if (ageMs < 30_000) return "live";
  if (ageMs < 120_000) return "stale";
  return "offline";
}

const STATUS_LABEL: Record<LiveStatus, string> = {
  live: "LIVE",
  stale: "STALE",
  offline: "OFFLINE",
};

const STATUS_DOT: Record<LiveStatus, string> = {
  live: "bg-emerald-500",
  stale: "bg-amber-500",
  offline: "bg-gray-400",
};

export function LiveEventsRail({
  refetchInterval = 8_000,
  limit = 12,
  className = "",
}: LiveEventsRailProps) {
  const navigate = useNavigate();
  const eventsQuery = useQuery({
    queryKey: ["live-events"],
    queryFn: () => fetchActivity("1h"),
    refetchInterval,
    staleTime: 0,
  });

  // Track ids we've seen so first-paint doesn't animate every row in. After
  // the baseline is seeded, new ids on a subsequent poll get the slide-in.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!eventsQuery.data) return;
    if (seenIdsRef.current.size === 0) {
      seenIdsRef.current = new Set(eventsQuery.data.map((entry) => entry.id));
      return;
    }
    const fresh = eventsQuery.data
      .filter((entry) => !seenIdsRef.current.has(entry.id))
      .map((entry) => entry.id);
    if (fresh.length === 0) return;
    fresh.forEach((id) => seenIdsRef.current.add(id));
    setNewIds(new Set(fresh));
    const handle = window.setTimeout(() => setNewIds(new Set()), 3_000);
    return () => window.clearTimeout(handle);
  }, [eventsQuery.data]);

  // Tick once per second so the "Updated Ns ago" footer + status pill
  // recompute their freshness without waiting for the next poll.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(handle);
  }, []);

  const entries = useMemo(
    () => (eventsQuery.data ?? []).slice(0, limit),
    [eventsQuery.data, limit]
  );

  const status = deriveStatus(eventsQuery.dataUpdatedAt, eventsQuery.isError, now);
  const updatedLabel = eventsQuery.dataUpdatedAt
    ? toRelativeTime(new Date(eventsQuery.dataUpdatedAt).toISOString())
    : "—";

  return (
    <aside className={`flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}>
      <style>{`
        @keyframes liveEventSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Live events</p>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
          <span className="relative inline-flex h-2 w-2">
            {status === "live" ? (
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${STATUS_DOT.live}`} />
            ) : null}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
          </span>
          {STATUS_LABEL[status]}
        </span>
      </header>

      <div className="max-h-[60vh] flex-1 overflow-y-auto px-2 py-2">
        {eventsQuery.isLoading && entries.length === 0 ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : eventsQuery.isError && entries.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-gray-500">Couldn't load live events.</p>
            <button
              type="button"
              className="mt-1 text-xs font-medium text-[var(--tenant-primary)] hover:underline"
              onClick={() => void eventsQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Clock size={20} className="text-gray-300" />
            <p className="mt-2 text-xs text-gray-500">No recent activity.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EventRow entry={entry} fresh={newIds.has(entry.id)} onClick={() => navigate(entry.link)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-gray-100 px-4 py-2.5 text-[11px] text-gray-500">
        Updated {updatedLabel}
      </footer>
    </aside>
  );
}

function EventRow({
  entry,
  fresh,
  onClick,
}: {
  entry: ActivityEntry;
  fresh: boolean;
  onClick: () => void;
}) {
  const Icon = ICON_MAP[entry.icon] ?? Activity;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary-light)]"
      style={fresh ? { animation: "liveEventSlideIn 250ms ease-out" } : undefined}
    >
      <span className="relative mt-1 inline-flex h-2 w-2 shrink-0">
        {fresh ? (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pingClass(entry.colour)}`} />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotClass(entry.colour)}`} />
      </span>
      <span className={`mt-0.5 shrink-0 ${iconColourClass(entry.colour)}`}>
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-xs font-medium text-gray-900">{entry.title}</span>
        <span className="mt-0.5 block text-[11px] text-gray-500">{toRelativeTime(entry.timestamp)}</span>
      </span>
    </button>
  );
}
