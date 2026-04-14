import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "@/lib/api";
import { agentPath } from "@/lib/agentPaths";

type RecentShipment = {
  shipmentId: string;
  trackingRef: string;
  status: string;
  lastActionAt: string;
  lastLocation: string | null;
  lastNotes: string | null;
};

export function ShipmentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RecentShipment[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiRequest<{ data: RecentShipment[] }>("/agents/shipments/recent?limit=50");
        if (!cancelled) {
          setRows(response.data ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : "Failed to load shipments";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
        <Link to={agentPath("dashboard")} className="text-sm text-[var(--tenant-primary)] hover:underline">
          Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Recent shipments</h1>
        <p className="mt-1 text-sm text-gray-600">Shipments you last updated.</p>
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
        {loading ? <p className="text-sm text-gray-600">Loading...</p> : null}
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {!loading && !error && rows.length === 0 ? <p className="text-sm text-gray-600">No shipment history yet.</p> : null}

        {!loading && !error && rows.length > 0 ? (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.shipmentId} className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-gray-900">{row.trackingRef}</span>
                  <span className="text-xs text-gray-500">{new Date(row.lastActionAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-gray-700">Status: {row.status.replaceAll("_", " ")}</p>
                {row.lastLocation ? <p className="mt-1 text-gray-600">Location: {row.lastLocation}</p> : null}
                {row.lastNotes ? <p className="mt-1 text-gray-600">Notes: {row.lastNotes}</p> : null}
                <Link to={agentPath(`shipment/${encodeURIComponent(row.trackingRef)}`)} className="mt-2 inline-flex text-[var(--tenant-primary)] hover:underline">
                  Open shipment
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}