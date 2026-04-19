import { Link } from "react-router-dom";
import { pluralize } from "@/lib/utils/formatters";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { useSyncStore } from "@/store/useSyncStore";

export const SyncBanner = () => {
  const pendingCount = useFieldDataStore((state) =>
    state.pendingMutations.filter((mutation) => mutation.state !== "synced").length,
  );
  const isOnline = useSyncStore((state) => state.isOnline);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const activeBatchSize = useSyncStore((state) => state.activeBatchSize);
  const manualOffline = useSyncStore((state) => state.manualOffline);

  if (isOnline && !isSyncing && pendingCount === 0) {
    return null;
  }

  const toneClassName = !isOnline
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : pendingCount > 0
      ? "border-cyan-200 bg-cyan-50 text-cyan-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  const message = !isOnline
    ? manualOffline
      ? "Forced offline mode is on. Actions will queue until you rejoin the network."
      : "Browser connectivity is down. Actions are stored locally and will replay later."
    : isSyncing
      ? `Replaying ${pluralize(activeBatchSize, "queued update")} now.`
      : `${pluralize(pendingCount, "queued update")} waiting for background sync.`;

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
