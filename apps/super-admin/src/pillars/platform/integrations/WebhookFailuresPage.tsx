import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { consoleApi } from "@/lib/console-api";

// platform.integrations — tenant webhook failures (L10, WP-2.13): dead-lettered deliveries across tenants and a
// dangerous Replay. The worker re-sends the stored payload signed with the endpoint's current secret; the tenant's
// delivery log shows the new attempt.

type WebhookFailure = {
  id: string;
  eventType: string;
  status: string;
  responseCode: number | null;
  attemptCount: number;
  deadLetteredAt: string;
  createdAt: string;
  endpoint: { id: string; url: string; tenantId: string };
  tenant: { id: string; name: string; slug: string };
};

const KEY = ["platform.integrations", "webhook-failures"] as const;

export function WebhookFailuresPage() {
  const queryClient = useQueryClient();
  const failures = useQuery({ queryKey: KEY, queryFn: async () => (await consoleApi.get<{ failures: WebhookFailure[] }>("/integrations/webhooks/failures")).data.failures });
  const [replaying, setReplaying] = useState<WebhookFailure | null>(null);
  const [replayed, setReplayed] = useState<string[]>([]);
  const rows = failures.data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Webhook failures</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Tenant webhook deliveries that used every retry. Replay re-sends the stored payload with a fresh signature.</p>
      </header>
      {failures.isError ? <ConsoleApiErrorPanel error={failures.error} onRetry={() => void failures.refetch()} title="Unable to load webhook failures" /> : null}
      {failures.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading webhook failures…</p> : null}
      {failures.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No dead-lettered deliveries.</p> : null}
      {rows.length > 0 ? (
        <table className="w-full rounded-lg border border-[var(--color-border)] bg-white text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-muted)]">
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Endpoint</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Last response</th>
              <th className="px-3 py-2">Dead-lettered</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((row) => (
              <tr key={row.id} data-testid="webhook-failure">
                <td className="px-3 py-2">
                  <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                </td>
                <td className="break-all px-3 py-2 font-mono text-xs">{row.endpoint.url}</td>
                <td className="px-3 py-2">{row.eventType}</td>
                <td className="px-3 py-2">{row.responseCode ?? "no response"} · {row.attemptCount} attempts</td>
                <td className="px-3 py-2 text-xs">{new Date(row.deadLetteredAt).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {replayed.includes(row.id) ? (
                    <span className="text-xs text-[var(--color-text-muted)]">Replay queued</span>
                  ) : (
                    <PermissionButton permission="platform.integrations.write" onClick={() => setReplaying(row)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50">
                      Replay
                    </PermissionButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <ActionDialog
        open={replaying !== null}
        dangerous
        title="Replay webhook delivery"
        description={replaying ? `${replaying.eventType} to ${replaying.endpoint.url} (${replaying.tenant.name})` : undefined}
        confirmLabel="Replay"
        onSubmit={async (reason) => {
          if (!replaying) return;
          await consoleApi.post(`/integrations/webhooks/deliveries/${encodeURIComponent(replaying.id)}/replay`, { reason });
          setReplayed((current) => [...current, replaying.id]);
          await queryClient.invalidateQueries({ queryKey: KEY });
        }}
        onClose={() => setReplaying(null)}
      />
    </div>
  );
}
