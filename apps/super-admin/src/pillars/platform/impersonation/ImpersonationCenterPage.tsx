import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePermission } from "@fauward/internal-rbac";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker } from "@/components/service-kit/TenantPicker";
import { useMe } from "@/lib/use-me";
import { useTenantDetail, useTenantUsers } from "@/pillars/platform/tenants/api";
import { type ImpersonationSession, type StartSessionResult, useActiveSessions, useEndSession, useSessionHistory, useStartSession } from "./api";

type Scope = "read" | "write";
const MIN_REASON: Record<Scope, number> = { read: 8, write: 20 };
const DURATIONS: Record<Scope, number[]> = { read: [5, 15, 30], write: [5, 10, 15] };

type PickedTenant = { id: string; name: string; slug: string };

const card = "rounded-lg border border-[var(--color-border)] bg-white p-4";
const field = "mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const labelCls = "block text-xs font-semibold text-[var(--color-text-muted)]";

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

/** Pre-selects the tenant passed as ?tenantId= (from the tenant list/detail) by loading it from the API. */
function usePreselectedTenant(onFound: (tenant: PickedTenant) => void) {
  const [params] = useSearchParams();
  const tenantId = params.get("tenantId") ?? "";
  const detail = useTenantDetail(tenantId);
  useEffect(() => {
    if (tenantId && detail.data) onFound({ id: detail.data.identity.id, name: detail.data.identity.name, slug: detail.data.identity.slug });
  }, [tenantId, detail.data, onFound]);
  return tenantId ? detail : null;
}

function StartSessionPanel() {
  const [tenant, setTenant] = useState<PickedTenant | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [scope, setScope] = useState<Scope>("read");
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState("");
  const [started, setStarted] = useState<StartSessionResult | null>(null);
  const preselected = usePreselectedTenant(setTenant);
  const users = useTenantUsers(tenant?.id ?? "", { activeOnly: true, enabled: Boolean(tenant) });
  const start = useStartSession();

  useEffect(() => setTargetUserId(""), [tenant?.id]);
  useEffect(() => setMinutes(DURATIONS[scope][DURATIONS[scope].length - 1]), [scope]);

  // ACC-IMP-7: no submit without a picked tenant, an active target user and a long enough reason.
  const canStart = Boolean(tenant) && Boolean(targetUserId) && reason.trim().length >= MIN_REASON[scope] && !start.isPending;

  return (
    <section className={`${card} space-y-3`}>
      <h2 className="text-sm font-semibold">Start a session</h2>
      {preselected?.isError ? <ConsoleApiErrorPanel error={preselected.error} title="The tenant from the link could not be loaded" /> : null}
      {tenant ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm">
          <span>
            Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} /> <span className="font-mono text-xs text-[var(--color-text-muted)]">{tenant.slug}</span>
          </span>
          <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)]" onClick={() => setTenant(null)}>
            Change
          </button>
        </div>
      ) : (
        <TenantPicker onSelect={(option) => setTenant({ id: option.id, name: option.name, slug: option.slug })} label="Tenant" />
      )}

      {tenant ? (
        <div>
          <label className={labelCls} htmlFor="impersonation-user">
            Sign in as (active users only)
          </label>
          {users.isError ? <ConsoleApiErrorPanel error={users.error} onRetry={() => void users.refetch()} title="Unable to load the tenant's users" /> : null}
          <select id="impersonation-user" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} className={field} disabled={users.isLoading}>
            <option value="">{users.isLoading ? "Loading users…" : (users.data ?? []).length === 0 ? "This tenant has no active users" : "Choose a user…"}</option>
            {(users.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.email} — {user.role}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className={`${labelCls} mb-1`}>Access</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="impersonation-scope" checked={scope === "read"} onChange={() => setScope("read")} />
          Read-only (up to 30 min)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="impersonation-scope" checked={scope === "write"} onChange={() => setScope("write")} />
          Read and write (needs platform.impersonation.mutate, 15 min max)
        </label>
      </fieldset>

      <div>
        <label className={labelCls} htmlFor="impersonation-duration">
          Duration
        </label>
        <select id="impersonation-duration" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className={field}>
          {DURATIONS[scope].map((value) => (
            <option key={value} value={value}>
              {value} minutes
            </option>
          ))}
        </select>
      </div>

      <label className="block">
        <span className={`${labelCls} mb-1`}>Reason (shown to the tenant, at least {MIN_REASON[scope]} characters)</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className={field} />
      </label>

      <PermissionButton
        permission="platform.impersonation.start"
        disabled={!canStart}
        className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        onClick={() => {
          setStarted(null);
          start.mutate(
            { tenantId: tenant!.id, targetUserId, scopes: scope === "write" ? ["read", "write"] : ["read"], expiresInMinutes: minutes, reason: reason.trim() },
            {
              onSuccess: (data) => {
                setStarted(data);
                // The portal URL carries a one-time code in the fragment (valid 60 s); the token never reaches the console.
                window.open(data.portalUrl, "_blank", "noopener,noreferrer");
              }
            }
          );
        }}
      >
        {start.isPending ? "Starting..." : "Start Impersonation"}
      </PermissionButton>

      {start.isError ? <ConsoleApiErrorPanel error={start.error} title="Unable to start impersonation" /> : null}
      {started ? (
        <p role="status" className="text-sm text-green-800">
          Session started for <TenantChip tenantId={started.tenant.id} name={started.tenant.name} slug={started.tenant.slug} /> as {started.targetUser.email}, ends {new Date(started.expiresAt).toLocaleTimeString()}. If no tab opened,{" "}
          <a href={started.portalUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            open the tenant portal
          </a>{" "}
          within 60 seconds.{" "}
          <Link to={`/platform/impersonation/sessions/${started.impersonationSessionId}`} className="font-semibold underline">
            View the session
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function SessionRows({ sessions, onEnd, empty }: { sessions: ImpersonationSession[]; onEnd?: (session: ImpersonationSession) => void; empty: string }) {
  const me = useMe().data;
  const canEndOthers = usePermission("platform.impersonation.mutate") === true;
  return (
    <table className="mt-3 min-w-full text-sm">
      <thead className="text-left text-xs text-[var(--color-text-muted)]">
        <tr>
          <th className="py-1">Tenant</th>
          <th className="py-1">Staff</th>
          <th className="py-1">Access</th>
          <th className="py-1">Reason</th>
          <th className="py-1">Started</th>
          <th className="py-1">{onEnd ? "Expires" : "Ended"}</th>
          <th className="py-1" />
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--color-border)]">
        {sessions.map((session) => {
          const own = session.platformUserId === me?.user.id;
          return (
            <tr key={session.id} data-testid="impersonation-session-row">
              <td className="py-2">
                <TenantChip tenantId={session.targetTenant.id} name={session.targetTenant.name} slug={session.targetTenant.slug} />
              </td>
              <td className="py-2 text-xs">{session.platformUser.name ?? session.platformUser.email}</td>
              <td className="py-2 text-xs">{session.scopes.includes("write") ? "Read and write" : "Read-only"}</td>
              <td className="py-2 text-xs">{session.reason}</td>
              <td className="py-2 text-xs">{when(session.createdAt)}</td>
              <td className="py-2 text-xs">{onEnd ? when(session.expiresAt) : `${when(session.endedAt ?? session.revokedAt ?? session.expiresAt)} (${(session.endedReason ?? "EXPIRED").toLowerCase()})`}</td>
              <td className="py-2 text-right">
                <div className="flex justify-end gap-2">
                  <Link to={`/platform/impersonation/sessions/${session.id}`} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold">
                    Audit trail
                  </Link>
                  {onEnd ? (
                    <button
                      type="button"
                      disabled={!own && !canEndOthers}
                      title={!own && !canEndOthers ? "Requires platform.impersonation.mutate" : undefined}
                      onClick={() => onEnd(session)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      End session
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
        {sessions.length === 0 ? (
          <tr>
            <td colSpan={7} className="py-4 text-center text-sm text-[var(--color-text-muted)]">
              {empty}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function HistoryPanel() {
  const [tenant, setTenant] = useState<PickedTenant | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const history = useSessionHistory({ tenantId: tenant?.id, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined });
  const sessions = history.data?.pages.flatMap((page) => page.sessions ?? []) ?? [];
  return (
    <section className={card}>
      <h2 className="text-sm font-semibold">History</h2>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {tenant ? (
          <div className="flex items-center gap-2 text-sm">
            <TenantChip tenantId={tenant.id} name={tenant.name} />
            <button type="button" onClick={() => setTenant(null)} className="text-xs font-semibold text-[var(--fauward-navy)]">
              Clear
            </button>
          </div>
        ) : (
          <TenantPicker onSelect={(option) => setTenant({ id: option.id, name: option.name, slug: option.slug })} label="Filter by tenant" />
        )}
        <label className="text-xs font-semibold text-[var(--color-text-muted)]">
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={field} />
        </label>
        <label className="text-xs font-semibold text-[var(--color-text-muted)]">
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={field} />
        </label>
      </div>
      {history.isError ? <ConsoleApiErrorPanel error={history.error} onRetry={() => void history.refetch()} /> : <SessionRows sessions={sessions} empty={history.isLoading ? "Loading…" : "No ended sessions match."} />}
      {history.hasNextPage ? (
        <button type="button" onClick={() => void history.fetchNextPage()} className="mt-2 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold">
          Load more
        </button>
      ) : null}
    </section>
  );
}

/** Impersonation Center (catalogue → platform.impersonation): start, active sessions with End, history, audit trail. */
export function ImpersonationCenterPage() {
  const active = useActiveSessions();
  const end = useEndSession();
  const [ending, setEnding] = useState<ImpersonationSession | null>(null);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Impersonation Center</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Start and end short-lived, audited tenant portal sessions. Sessions are read-only unless write access is requested; the tenant's admins can see every session.</p>
      </header>
      <StartSessionPanel />
      <section className={card}>
        <h2 className="text-sm font-semibold">Active sessions</h2>
        {active.isError ? <ConsoleApiErrorPanel error={active.error} onRetry={() => void active.refetch()} /> : <SessionRows sessions={active.data ?? []} onEnd={setEnding} empty={active.isLoading ? "Loading…" : "No active sessions."} />}
      </section>
      <HistoryPanel />
      <ActionDialog
        open={ending !== null}
        title={`End the session for ${ending?.targetTenant.name ?? ""}?`}
        description="The tenant portal tab stops working on its next request."
        confirmLabel="End session"
        dangerous
        onClose={() => setEnding(null)}
        onSubmit={async (reason) => {
          if (ending) await end.mutateAsync({ id: ending.id, reason });
        }}
      />
    </div>
  );
}
