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

export const SyncStatusScreen = () => {
  const pendingMutations = useFieldDataStore((state) => state.pendingMutations);
  const syncPendingMutations = useFieldDataStore((state) => state.syncPendingMutations);
  const clearSyncedMutations = useFieldDataStore((state) => state.clearSyncedMutations);
  const isOnline = useSyncStore((state) => state.isOnline);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt);
  const manualOffline = useSyncStore((state) => state.manualOffline);
  const toggleManualOffline = useSyncStore((state) => state.toggleManualOffline);

  const outstandingCount = pendingMutations.filter((mutation) => mutation.state !== "synced").length;

  return (
    <section className="space-y-6">
      <BackLink to="/jobs" label="Back to assigned jobs" />
      <ScreenHeader
        title="Sync status"
        subtitle="Replay is explicit here so operators can see exactly what remains queued under poor connectivity."
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
            disabled={!isOnline || isSyncing || outstandingCount === 0}
          >
            {isSyncing ? "Replaying batch..." : `Replay ${pluralize(outstandingCount, "update")}`}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={clearSyncedMutations}
            disabled={pendingMutations.every((mutation) => mutation.state !== "synced")}
          >
            Clear synced items
          </button>
        </div>
      </article>

      <div className="space-y-3">
        {pendingMutations.map((mutation) => (
          <article key={mutation.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="tiny-label">{pendingMutationTypeLabel[mutation.type]}</p>
                <h2 className="mt-2 text-lg font-semibold text-ink">{mutation.entityId}</h2>
                <p className="mt-2 text-sm text-stone-600">
                  Created {formatTimestamp(mutation.createdAt)} - retries {mutation.retryCount}
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
    </section>
  );
};
