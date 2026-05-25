import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { formatTimestamp, pluralize } from "@/lib/utils/formatters";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { useSyncStore } from "@/store/useSyncStore";
import {
  mutationStateTone,
  pendingMutationStateLabel,
  pendingMutationTypeLabel,
} from "@/types/field";
import type { PendingMutation } from "@/types/field";

const countPendingJobs = (mutations: PendingMutation[]): number => {
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

export const SyncStatusScreen = () => {
  const pendingMutations = useFieldDataStore((state) => state.pendingMutations);
  const syncPendingMutations = useFieldDataStore((state) => state.syncPendingMutations);
  const clearSyncedMutations = useFieldDataStore((state) => state.clearSyncedMutations);
  const clearFailedMutations = useFieldDataStore((state) => state.clearFailedMutations);
  const clearAllPendingMutations = useFieldDataStore((state) => state.clearAllPendingMutations);
  const isOnline = useSyncStore((state) => state.isOnline);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt);
  const manualOffline = useSyncStore((state) => state.manualOffline);
  const toggleManualOffline = useSyncStore((state) => state.toggleManualOffline);

  const outstandingJobCount = countPendingJobs(pendingMutations);
  const failedMutations = pendingMutations.filter((m) => m.state === "failed");

  return (
    <section className="space-y-6">
      <BackLink to="/jobs" label="Back to assigned jobs" />
      <ScreenHeader
        title="Sync status"
        subtitle="Updates sync automatically when online. Use this screen to monitor or manually retry failed items."
        kicker="Offline-safe queue"
      />

      <article className="panel p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="tiny-label">Connectivity</p>
            <p className="mt-2 text-lg font-semibold text-ink">{isOnline ? "Online" : "Offline"}</p>
          </div>
          <div>
            <p className="tiny-label">Last sync</p>
            <p className="mt-2 text-lg font-semibold text-ink">{formatTimestamp(lastSyncAt)}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          <button
            type="button"
            className="secondary-btn"
            onClick={toggleManualOffline}
          >
            {manualOffline ? "Return to live network mode" : "Force offline mode"}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => void syncPendingMutations()}
            disabled={!isOnline || isSyncing || outstandingJobCount === 0}
          >
            {isSyncing ? "Syncing..." : outstandingJobCount === 0 ? "All synced" : `Retry ${pluralize(outstandingJobCount, "job")}`}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={clearSyncedMutations}
            disabled={pendingMutations.every((mutation) => mutation.state !== "synced")}
          >
            Clear synced items
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={clearFailedMutations}
            disabled={failedMutations.length === 0}
          >
            Clear failed items
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={clearAllPendingMutations}
            disabled={pendingMutations.length === 0}
          >
            Reset queue
          </button>
        </div>
      </article>

      {failedMutations.length > 0 ? (
        <div className="space-y-3">
          {failedMutations.map((mutation) => (
            <article key={mutation.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="tiny-label">{pendingMutationTypeLabel[mutation.type]}</p>
                  <p className="mt-2 text-sm text-stone-600">
                    Failed after {mutation.retryCount} {mutation.retryCount === 1 ? "attempt" : "attempts"} · {formatTimestamp(mutation.createdAt)}
                  </p>
                </div>
                <StatusPill
                  label={pendingMutationStateLabel[mutation.state]}
                  tone={mutationStateTone[mutation.state]}
                />
              </div>
            </article>
          ))}
        </div>
      ) : outstandingJobCount === 0 ? (
        <p className="text-sm text-stone-500 text-center py-4">All updates synced successfully.</p>
      ) : null}
    </section>
  );
};
