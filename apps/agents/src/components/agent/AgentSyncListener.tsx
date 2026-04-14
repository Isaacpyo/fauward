import { useEffect, useRef } from "react";

import { useAgentAuth } from "@/context/AgentAuthContext";
import { apiRequest } from "@/lib/api";
import { peekAdvanceQueue, shiftAdvanceQueue } from "@/lib/agentOfflineQueue";

export function AgentSyncListener() {
  const { isAuthenticated, isRoleAllowed } = useAgentAuth();
  const running = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !isRoleAllowed) return;

    const drainQueue = async () => {
      if (running.current || !navigator.onLine) return;
      running.current = true;

      try {
        while (true) {
          const next = peekAdvanceQueue();
          if (!next) break;

          await apiRequest<{ success: boolean }>("/agents/shipments/advance", {
            method: "POST",
            body: JSON.stringify({
              trackingRef: next.trackingRef,
              location: next.location,
              notes: next.notes
            })
          });

          shiftAdvanceQueue();
        }
      } catch {
        // Stop on first failure to preserve ordering.
      } finally {
        running.current = false;
      }
    };

    drainQueue();
    window.addEventListener("online", drainQueue);

    return () => {
      window.removeEventListener("online", drainQueue);
    };
  }, [isAuthenticated, isRoleAllowed]);

  return null;
}