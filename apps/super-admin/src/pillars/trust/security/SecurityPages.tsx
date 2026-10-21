import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { consoleApi } from "@/lib/console-api";

// trust.security (WP-4.11): AnomaliesPage, LoginsPage, IpBlocksPage, SessionsPage. IP blocks are enforced from WP-5.4.

type Page<T> = { data: T[]; nextCursor: string | null };
type Anomaly = { id: string; type: string; severity: string; status: string; details: Record<string, unknown> | null; acknowledgedAt: string | null; resolvedAt: string | null; resolutionNote: string | null; createdAt: string };
type Login = { id: string; email: string; success: boolean; ipAddress: string | null; country: string | null; userAgent: string | null; failureReason: string | null; createdAt: string };
type IpBlock = { id: string; ipAddress: string; scope: string; reason: string; expiresAt: string | null; active: boolean; hitCount: number; createdAt: string };
type Session = { id: string; user: { id: string; email: string; name: string | null }; ipAddress: string | null; userAgent: string | null; mfaVerified: boolean; startedAt: string; expiresAt: string; current: boolean };

const KEY = ["trust.security"] as const;
const inputClass = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";
const secondary = "rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function SecurityNav({ active }: { active: "anomalies" | "logins" | "ip-blocks" | "sessions" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Security sections">
      {item("anomalies", "/trust/security/anomalies", "Anomalies")}
      {item("logins", "/trust/security/logins", "Staff logins")}
      {item("ip-blocks", "/trust/security/ip-blocks", "IP blocks")}
      {item("sessions", "/trust/security/sessions", "Sessions")}
    </nav>
  );
}

function usePaged<T, X = object>(key: unknown[], path: string, params: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: [...KEY, ...key, params],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => (await consoleApi.get<Page<T> & X>(path, { params: { ...params, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor
  });
}

function Header({ title, text, active }: { title: string; text: string; active: Parameters<typeof SecurityNav>[0]["active"] }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{text}</p>
      </div>
      <SecurityNav active={active} />
    </header>
  );
}

function Notice({ message }: { message: string | null }) {
  return message ? (
    <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
      {message}
    </p>
  ) : null;
}

function LoadMore({ query }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  return query.hasNextPage ? (
    <button type="button" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} className="text-xs underline">
      Load more
    </button>
  ) : null;
}

export function AnomaliesPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "OPEN";
  const anomalies = usePaged<Anomaly>(["anomalies"], "/security/anomalies", { status });
  const act = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: "acknowledge" | "resolve"; note?: string }) => (await consoleApi.post(`/security/anomalies/${encodeURIComponent(id)}/${action}`, note ? { note } : {}, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
  const [resolving, setResolving] = useState<Anomaly | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const rows = anomalies.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div className="space-y-4">
      <Header title="Security anomalies" text="Raised hourly by the anomaly scan (failed staff login spikes)." active="anomalies" />
      <Notice message={message} />
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Status
        <select aria-label="Anomaly status" value={status} onChange={(event) => setParams({ status: event.target.value }, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="OPEN">Open</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="RESOLVED">Resolved</option>
          <option value="ALL">All</option>
        </select>
      </label>
      {anomalies.isError ? <ConsoleApiErrorPanel error={anomalies.error} onRetry={() => void anomalies.refetch()} title="Unable to load anomalies" /> : null}
      {anomalies.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No anomalies.</p> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="anomaly-row">
            <span>
              <span className="font-semibold">{row.type.replace(/_/g, " ")}</span> <span className="text-xs text-[var(--color-text-muted)]">· {row.severity.toLowerCase()} · {row.status.toLowerCase()} · {when(row.createdAt)}</span>
              {row.details ? <span className="block font-mono text-[11px] text-[var(--color-text-muted)]">{JSON.stringify(row.details)}</span> : null}
              {row.resolutionNote ? <span className="block text-xs">Resolved: {row.resolutionNote}</span> : null}
            </span>
            <span className="flex gap-2">
              {row.status === "OPEN" ? (
                <PermissionButton permission="trust.security.write" onClick={() => void act.mutateAsync({ id: row.id, action: "acknowledge" }).then(() => setMessage("Acknowledged."))} className={secondary}>
                  Acknowledge
                </PermissionButton>
              ) : null}
              {row.status !== "RESOLVED" ? (
                <PermissionButton permission="trust.security.write" onClick={() => setResolving(row)} className={secondary}>
                  Resolve
                </PermissionButton>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <LoadMore query={anomalies} />
      <ActionDialog
        open={resolving !== null}
        title="Resolve this anomaly"
        confirmLabel="Resolve"
        validate={() => (note.trim().length >= 8 ? null : "Say what was done (at least 8 characters).")}
        onSubmit={async () => {
          if (!resolving) return;
          await act.mutateAsync({ id: resolving.id, action: "resolve", note: note.trim() });
          setMessage("Resolved.");
          setNote("");
        }}
        onClose={() => setResolving(null)}
      >
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Resolution
          <textarea aria-label="Resolution note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={inputClass} />
        </label>
      </ActionDialog>
    </div>
  );
}

export function LoginsPage() {
  const [params, setParams] = useSearchParams();
  const outcome = params.get("outcome") ?? "ALL";
  const logins = usePaged<Login, { tenantLogins: { available: boolean; reason: string } }>(["logins"], "/security/logins", { outcome });
  const rows = logins.data?.pages.flatMap((page) => page.data) ?? [];
  const tenantLogins = logins.data?.pages[0]?.tenantLogins;
  return (
    <div className="space-y-4">
      <Header title="Staff logins" text="Every console sign-in attempt." active="logins" />
      {tenantLogins && !tenantLogins.available ? (
        <DegradedBanner variant="not-wired" fixedBy="tenant sign-in audit">
          {tenantLogins.reason}
        </DegradedBanner>
      ) : null}
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Outcome
        <select aria-label="Login outcome" value={outcome} onChange={(event) => setParams({ outcome: event.target.value }, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="ALL">All</option>
          <option value="FAILED">Failed</option>
          <option value="SUCCEEDED">Succeeded</option>
        </select>
      </label>
      {logins.isError ? <ConsoleApiErrorPanel error={logins.error} onRetry={() => void logins.refetch()} title="Unable to load logins" /> : null}
      {logins.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No sign-in attempts.</p> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="login-row">
            <span>
              <span className={row.success ? "text-green-700" : "text-red-700"}>{row.success ? "Signed in" : `Failed${row.failureReason ? ` (${row.failureReason})` : ""}`}</span> · {row.email}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {row.ipAddress ?? "—"}
              {row.country ? ` · ${row.country}` : ""} · {when(row.createdAt)}
            </span>
          </li>
        ))}
      </ul>
      <LoadMore query={logins} />
    </div>
  );
}

export function IpBlocksPage() {
  const queryClient = useQueryClient();
  const blocks = usePaged<IpBlock, { enforcement: { enforced: boolean; reason: string } }>(["ip-blocks"], "/security/ip-blocks", {});
  const create = useMutation({ mutationFn: async (body: { ipAddress: string; scope: string; expiresAt: string | null; reason: string }) => (await consoleApi.post("/security/ip-blocks", body, { idempotent: true })).data, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
  const remove = useMutation({ mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await consoleApi.delete(`/security/ip-blocks/${encodeURIComponent(id)}`, { data: { reason }, idempotent: true })).data, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<IpBlock | null>(null);
  const [ip, setIp] = useState("");
  const [scope, setScope] = useState("ALL");
  const [expiresOn, setExpiresOn] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const rows = blocks.data?.pages.flatMap((page) => page.data) ?? [];
  const enforcement = blocks.data?.pages[0]?.enforcement;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">IP blocks</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Addresses refused by the console, the tenant API, or both.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecurityNav active="ip-blocks" />
          <PermissionButton permission="trust.security.write" onClick={() => setAdding(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white">
            Block an IP
          </PermissionButton>
        </div>
      </header>
      {enforcement && !enforcement.enforced ? (
        <DegradedBanner variant="not-wired" fixedBy="WP-5.4">
          {enforcement.reason}
        </DegradedBanner>
      ) : null}
      <Notice message={message} />
      {blocks.isError ? <ConsoleApiErrorPanel error={blocks.error} onRetry={() => void blocks.refetch()} title="Unable to load IP blocks" /> : null}
      {blocks.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No IP is blocked.</p> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="ip-block-row">
            <span>
              <span className="font-mono">{row.ipAddress}</span> <span className="text-xs text-[var(--color-text-muted)]">· {row.scope.toLowerCase().replace("_", " ")} · {row.active ? (row.expiresAt ? `until ${when(row.expiresAt)}` : "no expiry") : "expired"}</span>
              <span className="block text-xs">{row.reason}</span>
            </span>
            <PermissionButton permission="trust.security.write" onClick={() => setRemoving(row)} className={secondary}>
              Remove
            </PermissionButton>
          </li>
        ))}
      </ul>
      <LoadMore query={blocks} />
      <ActionDialog
        open={adding}
        dangerous
        title="Block an IP address"
        confirmLabel="Block"
        validate={() => (/^[0-9a-fA-F:.]+$/.test(ip.trim()) ? null : "Enter one IPv4 or IPv6 address.")}
        onSubmit={async (reason) => {
          await create.mutateAsync({ ipAddress: ip.trim(), scope, expiresAt: expiresOn ? new Date(`${expiresOn}T23:59:59Z`).toISOString() : null, reason });
          setMessage(`${ip.trim()} blocked.`);
          setIp("");
          setExpiresOn("");
        }}
        onClose={() => setAdding(false)}
      >
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          IP address
          <input value={ip} onChange={(event) => setIp(event.target.value)} className={`${inputClass} font-mono`} />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Scope
          <select value={scope} onChange={(event) => setScope(event.target.value)} className={inputClass}>
            <option value="ALL">Everything</option>
            <option value="CONSOLE">Console only</option>
            <option value="TENANT_API">Tenant API only</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Expires on (optional, UTC)
          <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} className={inputClass} />
        </label>
      </ActionDialog>
      <ActionDialog
        open={removing !== null}
        dangerous
        title={`Unblock ${removing?.ipAddress ?? ""}`}
        confirmLabel="Remove block"
        onSubmit={async (reason) => {
          if (!removing) return;
          await remove.mutateAsync({ id: removing.id, reason });
          setMessage(`${removing.ipAddress} unblocked.`);
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

export function SessionsPage() {
  const queryClient = useQueryClient();
  const sessions = usePaged<Session>(["sessions"], "/security/sessions", {});
  const revoke = useMutation({ mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await consoleApi.post(`/security/sessions/${encodeURIComponent(id)}/revoke`, { reason }, { idempotent: true })).data, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
  const [target, setTarget] = useState<Session | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rows = sessions.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div className="space-y-4">
      <Header title="Console sessions" text="Signed-in staff. Revoking a session signs that person out on their next request." active="sessions" />
      <Notice message={message} />
      {sessions.isError ? <ConsoleApiErrorPanel error={sessions.error} onRetry={() => void sessions.refetch()} title="Unable to load sessions" /> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="session-row">
            <span>
              {row.user.name ?? row.user.email} <span className="text-xs text-[var(--color-text-muted)]">· {row.ipAddress ?? "—"} · since {when(row.startedAt)}{row.mfaVerified ? "" : " · MFA pending"}</span>
              {row.current ? <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-800">this session</span> : null}
            </span>
            {row.current ? null : (
              <PermissionButton permission="trust.security.write" onClick={() => setTarget(row)} className={secondary}>
                Revoke
              </PermissionButton>
            )}
          </li>
        ))}
      </ul>
      <LoadMore query={sessions} />
      <ActionDialog
        open={target !== null}
        dangerous
        title={`Revoke ${target?.user.name ?? target?.user.email ?? ""}'s session`}
        description="They are signed out on their next request and told why."
        confirmLabel="Revoke session"
        onSubmit={async (reason) => {
          if (!target) return;
          await revoke.mutateAsync({ id: target.id, reason });
          setMessage("Session revoked.");
        }}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
