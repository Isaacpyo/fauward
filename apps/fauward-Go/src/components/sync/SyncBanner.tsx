import { Link } from "react-router-dom";
import { pluralize } from "@/lib/utils/formatters";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { useSyncStore } from "@/store/useSyncStore";

const countPendingJobs = (mutations: { state: string; payload: Record<string, unknown> }[]): number => {
  const outstanding = mutations.filter((m) => m.state !== "synced");
  const stopIds = new Set<string>();
  let noStopCount = 0;
  for (const m of outstanding) {
    const stopId = typeof m.payload.stopId === "string" ? m.payload.stopId : null;
    if (stopId) stopIds.add(stopId);
    else noStopCount++;
  }
  return stopIds.size + noStopCount;
};

export const SyncBanner = () => {
  const pendingJobCount = useFieldDataStore((state) => countPendingJobs(state.pendingMutations));
  const isOnline = useSyncStore((state) => state.isOnline);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const manualOffline = useSyncStore((state) => state.manualOffline);

  if (isOnline && !isSyncing && pendingJobCount === 0) {
    return null;
  }

  const toneClassName = !isOnline
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : pendingJobCount > 0
      ? "border-cyan-200 bg-cyan-50 text-cyan-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  const message = !isOnline
    ? manualOffline
      ? "Forced offline mode is on. Actions will queue until you rejoin the network."
      : "Offline — actions are stored locally and will sync when back online."
    : isSyncing
      ? "Syncing..."
      : `${pluralize(pendingJobCount, "job")} queued — syncing now.`;

  return (
    <div className={`sticky top-[7rem] z-10 mx-3 mt-4 rounded-2xl border px-4 py-3 text-sm font-medium backdrop-blur ${toneClassName}`}>
      <div className="flex items-center justify-between gap-3">
        <p>{message}</p>
        <Link to="/sync" className="font-semibold text-brand">
          Queue
        </Link>
      </div>
    </div>
  );
};
