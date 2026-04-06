import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { QRScanner } from "@/components/driver/QRScanner";
import { RouteHeader } from "@/components/driver/RouteHeader";
import { StopCard } from "@/components/driver/StopCard";
import { Button } from "@/components/ui/Button";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOfflineQueue } from "@/stores/useOfflineQueue";
import { useSyncStore } from "@/stores/useSyncStore";
import { useDriverStore } from "@/stores/useDriverStore";

export function RoutePage() {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const routeStarted = useDriverStore((state) => state.routeStarted);
  const startRoute = useDriverStore((state) => state.startRoute);
  const stops = useDriverStore((state) => state.stops);
  const online = useOnlineStatus();
  const queue = useOfflineQueue((state) => state.queue);
  const dequeue = useOfflineQueue((state) => state.dequeue);
  const markFailed = useOfflineQueue((state) => state.markFailed);
  const startSync = useSyncStore((state) => state.startSync);
  const stopSync = useSyncStore((state) => state.stopSync);
  const setFailures = useSyncStore((state) => state.setFailures);

  async function refreshRoute() {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setRefreshing(false);
  }

  async function syncOfflineActions() {
    if (!online || queue.length === 0) {
      return;
    }
    startSync();
    const failed: string[] = [];
    for (const item of queue) {
      const shouldFail = Math.random() < 0.15;
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (shouldFail) {
        markFailed(item.id);
        failed.push(item.id);
      } else {
        dequeue(item.id);
      }
    }
    setFailures(failed);
    stopSync();
  }

  function handleScanResult(scannedValue: string) {
    const code = scannedValue.trim().toUpperCase();
    const match = stops.find((stop) =>
      stop.shipments.some((shipment) => {
        return shipment.id.toUpperCase() === code || shipment.trackingNumber.toUpperCase() === code;
      })
    );

    setScannerOpen(false);
    if (!match) {
      window.alert("Scanned code not found in today's route.");
      return;
    }

    navigate(`/route/stop/${match.id}`);
  }

  return (
    <div className="space-y-4 pb-24">
      <RouteHeader stopCount={stops.length} />

      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={refreshRoute} leftIcon={<RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />}>
          {refreshing ? "Refreshing..." : "Pull to refresh"}
        </Button>
        <Button variant="secondary" onClick={() => setScannerOpen(true)}>
          Scan
        </Button>
        {online && queue.length > 0 ? (
          <Button variant="secondary" onClick={syncOfflineActions}>
            Sync pending
          </Button>
        ) : null}
      </div>

      {stops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-white p-6 text-center text-sm text-gray-600">
          No route assigned for today
        </div>
      ) : (
        <div className="space-y-3">
          {stops.map((stop) => (
            <StopCard key={stop.id} stop={stop} />
          ))}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-[var(--border-color)] bg-white px-4 py-3">
        <Button variant="success" onClick={startRoute}>
          {routeStarted ? "Resume Route" : "Start Route"}
        </Button>
      </div>

      {scannerOpen ? <QRScanner onDetected={handleScanResult} onClose={() => setScannerOpen(false)} /> : null}
    </div>
  );
}
