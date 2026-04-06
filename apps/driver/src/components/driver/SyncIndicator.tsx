import { Loader2 } from "lucide-react";

import { useOfflineQueue } from "@/stores/useOfflineQueue";
import { useSyncStore } from "@/stores/useSyncStore";

export function SyncIndicator() {
  const queue = useOfflineQueue((state) => state.queue);
  const isSyncing = useSyncStore((state) => state.isSyncing);

  if (isSyncing) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-600">
        <Loader2 size={14} className="animate-spin" />
        Syncing...
      </span>
    );
  }

  return (
    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
      {queue.length} pending updates
    </span>
  );
}

