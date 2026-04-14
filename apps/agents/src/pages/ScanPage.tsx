import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { QRScanner } from "@/components/agent/QRScanner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { enqueueScan, peekScanQueue, shiftScanQueue } from "@/lib/agentOfflineQueue";
import { RECENT_SCANS_KEY } from "@/lib/agentLocalKeys";
import { agentPath } from "@/lib/agentPaths";

function extractTrackingRef(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const queryRef = url.searchParams.get("ref") || url.searchParams.get("tracking") || url.searchParams.get("trackingRef");
      if (queryRef) return queryRef.trim();

      const match = url.pathname.match(/\/(track|scan|label|shipment)\/([^/]+)/i);
      if (match?.[2]) return decodeURIComponent(match[2]).trim();
    } catch {
      return null;
    }
  }

  return trimmed;
}

function isValidTrackingRef(ref: string): boolean {
  return /^[A-Za-z0-9-]{6,40}$/.test(ref);
}

function storeRecentScan(ref: string) {
  try {
    const raw = localStorage.getItem(RECENT_SCANS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const next = [ref, ...(Array.isArray(parsed) ? parsed : [])].filter((item, idx, arr) => arr.indexOf(item) === idx);
    localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(next.slice(0, 10)));
  } catch {
    // Ignore storage errors.
  }
}

export function ScanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [manualRef, setManualRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState(false);
  const handledDeepLink = useRef<string | null>(null);

  const deepRef = useMemo(() => searchParams.get("ref"), [searchParams]);

  const resolveTrackingRef = (raw: string) => {
    setError(null);
    setOfflineNotice(false);

    const ref = extractTrackingRef(raw);
    if (!ref || !isValidTrackingRef(ref)) {
      setError("Unable to read a valid tracking reference.");
      return;
    }

    storeRecentScan(ref);

    if (!navigator.onLine) {
      enqueueScan(ref);
      setOfflineNotice(true);
      return;
    }

    navigate(agentPath(`shipment/${encodeURIComponent(ref)}`));
  };

  useEffect(() => {
    if (!deepRef || handledDeepLink.current === deepRef) return;
    handledDeepLink.current = deepRef;
    setManualRef(deepRef);
    resolveTrackingRef(deepRef);
  }, [deepRef]);

  useEffect(() => {
    if (deepRef) return;

    const processQueue = () => {
      if (!navigator.onLine) return;
      const pending = peekScanQueue();
      if (!pending) return;
      shiftScanQueue();
      navigate(agentPath(`shipment/${encodeURIComponent(pending.trackingRef)}`));
    };

    processQueue();
    window.addEventListener("online", processQueue);

    return () => {
      window.removeEventListener("online", processQueue);
    };
  }, [deepRef, navigate]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
        <Link to={agentPath("dashboard")} className="text-sm text-[var(--tenant-primary)] hover:underline">
          Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Scan shipment</h1>
        <p className="mt-1 text-sm text-gray-600">Use your camera to scan the shipment label.</p>

        <div className="mt-4">
          <QRScanner onScan={resolveTrackingRef} />
        </div>

        {offlineNotice ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Saved offline. It will sync automatically when you are back online.
          </p>
        ) : null}
        {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Manual tracking reference</h2>
        <div className="mt-3 flex flex-col gap-3 md:flex-row">
          <Input value={manualRef} onChange={(event) => setManualRef(event.target.value)} placeholder="e.g. FWD-2026-10021" />
          <Button type="button" onClick={() => resolveTrackingRef(manualRef)}>
            Lookup
          </Button>
        </div>
      </section>
    </div>
  );
}