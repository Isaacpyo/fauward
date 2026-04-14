import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAgentAuth } from "@/context/AgentAuthContext";
import { loadAdvanceQueue, loadScanQueue } from "@/lib/agentOfflineQueue";
import { RECENT_SCANS_KEY } from "@/lib/agentLocalKeys";
import { agentPath } from "@/lib/agentPaths";

export function DashboardPage() {
  const { session } = useAgentAuth();
  const [recentScans, setRecentScans] = useState<string[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_SCANS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setRecentScans(parsed.slice(0, 10));
      }
    } catch {
      setRecentScans([]);
    }

    setPendingSyncCount(loadAdvanceQueue().length + loadScanQueue().length);
  }, []);

  const roleLabel = useMemo(() => session?.user.role?.replaceAll("_", " ") ?? "Unknown", [session?.user.role]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Welcome back</h1>
        <p className="mt-1 text-sm text-gray-600">{session?.user.email}</p>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Role</p>
            <p className="font-medium text-gray-900">{roleLabel}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Tenant</p>
            <p className="font-medium text-gray-900">{session?.tenantSlug ?? "N/A"}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Pending sync</p>
            <p className="font-medium text-gray-900">{pendingSyncCount}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to={agentPath("scan")}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-[var(--tenant-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Scan QR code
          </Link>
          <Link
            to={agentPath("shipments")}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-semibold text-gray-700"
          >
            Shipment history
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Recent scans</h2>
        {recentScans.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No recent scans yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentScans.map((ref) => (
              <li key={ref} className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                <span className="font-mono text-gray-900">{ref}</span>
                <Link className="text-[var(--tenant-primary)] hover:underline" to={agentPath(`shipment/${encodeURIComponent(ref)}`)}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}