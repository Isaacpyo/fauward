import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "@/lib/api";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
};

type SessionRow = {
  id: string;
  platformUserId: string;
  targetTenantId: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  targetTenant?: { id: string; name: string; slug: string };
};

function portalUrl(slug: string, token: string) {
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `http://localhost:3000/auth/impersonate?token=${encodeURIComponent(token)}`;
  }
  return `https://${slug}.fauward.com/auth/impersonate?token=${encodeURIComponent(token)}`;
}

export function ImpersonationStartPage() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [tenantQuery, setTenantQuery] = useState(params.get("tenant") ?? "");
  const [selectedTenantId, setSelectedTenantId] = useState(params.get("tenant") ?? "");
  const [reason, setReason] = useState("Support investigation requested by tenant admin");

  const tenantsQuery = useQuery({
    queryKey: ["platform-tenants", tenantQuery],
    queryFn: async () => (await api.get<{ data: TenantRow[] }>("/tenants", { params: { search: tenantQuery, limit: 10 } })).data.data,
    enabled: tenantQuery.trim().length > 1
  });

  const sessionsQuery = useQuery({
    queryKey: ["platform-impersonation-sessions"],
    queryFn: async () => (await api.get<{ sessions: SessionRow[] }>("/impersonation-sessions/active")).data.sessions,
    refetchInterval: 30_000
  });

  const selectedTenant = useMemo(
    () => tenantsQuery.data?.find((tenant) => tenant.id === selectedTenantId),
    [selectedTenantId, tenantsQuery.data]
  );

  const startMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{
        token: string;
        impersonationSessionId: string;
        tenant: { id: string; name: string; slug: string };
      }>(`/tenants/${encodeURIComponent(selectedTenantId)}/impersonation-sessions`, { reason });
      return response.data;
    },
    onSuccess: (data) => {
      window.open(portalUrl(data.tenant.slug, data.token), "_blank", "noopener,noreferrer");
      void queryClient.invalidateQueries({ queryKey: ["platform-impersonation-sessions"] });
    }
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/impersonation-sessions/${encodeURIComponent(id)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-impersonation-sessions"] })
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Impersonation Center</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Start and revoke short-lived tenant portal sessions.</p>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1fr,1fr,auto]">
          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Tenant search</span>
            <input
              value={tenantQuery}
              onChange={(event) => setTenantQuery(event.target.value)}
              className="h-10 w-full rounded-md border border-[var(--color-border)] px-3 text-sm"
              placeholder="Tenant name or slug"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">Reason</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-10 w-full rounded-md border border-[var(--color-border)] px-3 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={!selectedTenantId || reason.trim().length < 8 || startMutation.isPending}
            className="self-end rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() => startMutation.mutate()}
          >
            Start Impersonation
          </button>
        </div>

        {tenantsQuery.data && tenantsQuery.data.length > 0 ? (
          <div className="mt-3 divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
            {tenantsQuery.data.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${selectedTenantId === tenant.id ? "bg-amber-50" : "bg-white"}`}
                onClick={() => setSelectedTenantId(tenant.id)}
              >
                <span>
                  <span className="font-semibold">{tenant.name}</span>
                  <span className="ml-2 text-xs text-[var(--color-text-muted)]">{tenant.slug}</span>
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{tenant.plan} | {tenant.status}</span>
              </button>
            ))}
          </div>
        ) : null}

        {startMutation.isError ? (
          <p className="mt-3 text-sm text-red-700">Unable to start impersonation. Confirm MFA is fresh and the reason is valid.</p>
        ) : null}
        {selectedTenant ? <p className="mt-3 text-xs text-[var(--color-text-muted)]">Selected: {selectedTenant.name}</p> : null}
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Active Sessions</h2>
        <div className="mt-3 divide-y divide-[var(--color-border)]">
          {(sessionsQuery.data ?? []).map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">{session.targetTenant?.name ?? session.targetTenantId}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Actor {session.platformUserId} | Expires {new Date(session.expiresAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                onClick={() => revokeMutation.mutate(session.id)}
              >
                Revoke
              </button>
            </div>
          ))}
          {!sessionsQuery.isLoading && (sessionsQuery.data ?? []).length === 0 ? (
            <p className="py-3 text-sm text-[var(--color-text-muted)]">No active sessions.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
