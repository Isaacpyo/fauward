import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { platformApi as api } from "@/lib/console-api";

type SessionRow = {
  id: string;
  platformUserId: string;
  targetTenantId: string;
  reason: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  targetTenant?: { id: string; name: string; slug: string };
};

type StartResponse = {
  exchangeCode: string;
  portalUrl: string;
  impersonationSessionId: string;
  expiresAt: string;
  tenant: { id: string; name: string; slug: string };
};

type Scope = "read" | "write";
const MIN_REASON: Record<Scope, number> = { read: 8, write: 20 };

export function ImpersonationStartPage() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [tenant, setTenant] = useState<Pick<TenantOption, "id" | "name" | "slug"> | null>(params.get("tenant") ? { id: params.get("tenant")!, name: params.get("tenant")!, slug: "" } : null);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<Scope>("read");
  const [started, setStarted] = useState<StartResponse | null>(null);
  const [ending, setEnding] = useState<SessionRow | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["platform-impersonation-sessions"],
    queryFn: async () => (await api.get<{ sessions: SessionRow[] }>("/impersonation-sessions/active")).data.sessions,
    refetchInterval: 30_000
  });

  const startMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<StartResponse>(`/tenants/${encodeURIComponent(tenant!.id)}/impersonation-sessions`, {
          reason: reason.trim(),
          scopes: scope === "write" ? ["read", "write"] : ["read"]
        })
      ).data,
    onSuccess: (data) => {
      setStarted(data);
      // The portal URL carries a one-time code in the fragment (valid 60 s); the token never reaches the console.
      window.open(data.portalUrl, "_blank", "noopener,noreferrer");
      void queryClient.invalidateQueries({ queryKey: ["platform-impersonation-sessions"] });
    }
  });

  const canStart = Boolean(tenant) && reason.trim().length >= MIN_REASON[scope] && !startMutation.isPending;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Impersonation Center</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Start and end short-lived, audited tenant portal sessions. Sessions are read-only unless write access is requested.</p>
      </header>

      <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
        {tenant ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm">
            <span>
              Tenant: <span className="font-semibold">{tenant.name}</span> {tenant.slug ? <span className="font-mono text-xs text-[var(--color-text-muted)]">{tenant.slug}</span> : null}
            </span>
            <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)]" onClick={() => setTenant(null)}>
              Change
            </button>
          </div>
        ) : (
          <TenantPicker onSelect={(option) => setTenant(option)} label="Tenant" />
        )}

        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">Access</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="impersonation-scope" checked={scope === "read"} onChange={() => setScope("read")} />
            Read-only (up to 30 min)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="impersonation-scope" checked={scope === "write"} onChange={() => setScope("write")} />
            Read and write (needs platform.impersonation.mutate, 15 min max)
          </label>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Reason (shown to the tenant, at least {MIN_REASON[scope]} characters)</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
        </label>

        <PermissionButton
          permission="platform.impersonation.start"
          disabled={!canStart}
          className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          onClick={() => {
            setStarted(null);
            startMutation.mutate();
          }}
        >
          {startMutation.isPending ? "Starting..." : "Start Impersonation"}
        </PermissionButton>

        {startMutation.isError ? <ConsoleApiErrorPanel error={startMutation.error} title="Unable to start impersonation" /> : null}
        {started ? (
          <p role="status" className="text-sm text-green-800">
            Session started for {started.tenant.name}, ends {new Date(started.expiresAt).toLocaleTimeString()}. If no tab opened,{" "}
            <a href={started.portalUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              open the tenant portal
            </a>{" "}
            within 60 seconds.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Active Sessions</h2>
        {sessionsQuery.isError ? <ConsoleApiErrorPanel error={sessionsQuery.error} onRetry={() => void sessionsQuery.refetch()} /> : null}
        <div className="mt-3 divide-y divide-[var(--color-border)]">
          {(sessionsQuery.data ?? []).map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">{session.targetTenant?.name ?? session.targetTenantId}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {session.scopes.includes("write") ? "Read and write" : "Read-only"} | Actor {session.platformUserId} | Expires {new Date(session.expiresAt).toLocaleString()}
                </p>
              </div>
              <PermissionButton permission="platform.impersonation.start" className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50" onClick={() => setEnding(session)}>
                End session
              </PermissionButton>
            </div>
          ))}
          {!sessionsQuery.isLoading && !sessionsQuery.isError && (sessionsQuery.data ?? []).length === 0 ? <p className="py-3 text-sm text-[var(--color-text-muted)]">No active sessions.</p> : null}
        </div>
      </section>

      <ActionDialog
        open={ending !== null}
        title={`End the session for ${ending?.targetTenant?.name ?? ending?.targetTenantId ?? ""}?`}
        description="The tenant portal tab stops working on its next request."
        confirmLabel="End session"
        dangerous
        onClose={() => setEnding(null)}
        onSubmit={async (endReason) => {
          if (!ending) return;
          await api.delete(`/impersonation-sessions/${encodeURIComponent(ending.id)}`, { data: { reason: endReason } });
          await queryClient.invalidateQueries({ queryKey: ["platform-impersonation-sessions"] });
        }}
      />
    </div>
  );
}
