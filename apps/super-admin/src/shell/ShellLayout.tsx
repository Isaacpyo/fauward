import { Logs } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { internalApi } from "@/lib/internal-api";
import { buildPermissionContext, type PlatformSessionUser } from "@/lib/platform-session";
import { PillarSidebar } from "@/shell/PillarSidebar";
import { TopBar } from "@/shell/TopBar";

export type ShellRouteContext = {
  user: PlatformSessionUser;
};

type NotificationLog = {
  id: string;
  tenantId: string;
  channel: string;
  event: string;
  status: string;
  error?: string | null;
  createdAt: string;
};

const STATUS_COLOUR: Record<string, string> = {
  SENT: "text-green-600",
  QUEUED: "text-amber-600",
  FAILED: "text-red-600",
};

function LogsPanel({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ logs: NotificationLog[] }>("/logs")
      .then((r) => setLogs(r.data.logs ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full w-[420px] shrink-0 flex-col border-l border-[var(--color-border)] bg-white">
      {/* header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
        <div className="flex items-center gap-2">
          <Logs size={14} className="text-[var(--color-text-muted)]" />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Notification Logs</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)] hover:text-[var(--color-text-primary)]"
        >
          ✕
        </button>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-200 border-t-[var(--fauward-navy)]" />
          </div>
        ) : logs.length === 0 ? (
          <p className="px-4 py-6 text-xs text-[var(--color-text-muted)]">No logs found.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {logs.map((log) => (
              <li key={log.id} className="px-4 py-2.5 hover:bg-[var(--color-surface-50)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] font-semibold text-[var(--color-text-primary)]">
                      {log.event}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                      {log.channel} · {log.tenantId.slice(0, 8)}…
                    </p>
                    {log.error ? (
                      <p className="mt-0.5 truncate font-mono text-[10px] text-red-600">{log.error}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`font-mono text-[10px] font-semibold ${STATUS_COLOUR[log.status] ?? "text-[var(--color-text-muted)]"}`}>
                      {log.status}
                    </span>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ShellLayout() {
  const { user } = useOutletContext<ShellRouteContext>();
  const [logsOpen, setLogsOpen] = useState(false);
  const permissionContext = buildPermissionContext(user);
  const canRequestJit = permissionContext.permissions.includes("trust.jit.request");
  const activeJit = useQuery({
    queryKey: ["active-jit-sessions", user.id],
    queryFn: async () => (await internalApi.get<{ data?: Array<{ id: string; permission?: string; expiresAt?: string }> }>("/jit/sessions/my")).data,
    enabled: canRequestJit,
    refetchInterval: 60_000
  });
  const sessions = activeJit.data?.data ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface-50)] text-[var(--color-text-primary)]">
      <TopBar user={user} />
      {sessions.length > 0 ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs font-medium text-amber-900">
          Elevated access active: {sessions.map((session) => session.permission ?? session.id).join(", ")}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <PillarSidebar />
        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>

        {/* Logs tab */}
        {!logsOpen && (
          <button
            type="button"
            onClick={() => setLogsOpen(true)}
            className="fixed bottom-1/2 right-0 z-40 flex translate-y-1/2 items-center gap-1.5 rounded-l-md border border-r-0 border-[var(--color-border)] bg-white px-2 py-3 text-[11px] font-semibold text-[var(--color-text-muted)] shadow-sm hover:bg-[var(--color-surface-50)] hover:text-[var(--color-text-primary)]"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            <Logs size={12} />
            Logs
          </button>
        )}

        {logsOpen && <LogsPanel onClose={() => setLogsOpen(false)} />}
      </div>
    </div>
  );
}
