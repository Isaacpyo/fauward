import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

type AuditEvent = {
  id: string;
  timestamp: string;
  action: string;
  actorType: string | null;
  actorIp: string | null;
  resourceType: string | null;
  resourceId: string | null;
  actor: { email: string } | null;
  metadata: Record<string, unknown> | null;
};

type AuditLogResponse = { events: AuditEvent[]; total: number; totalPages: number };

function actorLabel(event: AuditEvent) {
  if (event.actorType === "IMPERSONATOR") return "Fauward staff (via impersonation)";
  return event.actor?.email ?? "System";
}

/** The workspace's own audit trail (`GET /v1/audit-log`, plan feature `auditLog`). */
export function AuditLogPage() {
  const tenant = useTenantStore((state) => state.tenant);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["audit-log", page],
    queryFn: async () => (await api.get<AuditLogResponse>("/v1/audit-log", { params: { page, limit: 50 } })).data
  });

  return (
    <PageShell title="Audit log" description="Every change made in this workspace, newest first.">
      {query.isError ? (
        <ErrorState title="Audit log could not be loaded" description={apiErrorMessage(query.error, "The audit service returned an error.")} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <Skeleton className="h-64 w-full" />
      ) : query.data.events.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">No audit events recorded yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Time", "Actor", "Action", "Resource", "IP"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {query.data.events.map((event) => (
                  <tr key={event.id} data-testid="audit-row">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">{formatDateTime(event.timestamp, tenant)}</td>
                    <td className="px-4 py-2 text-xs font-medium">{actorLabel(event)}</td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">{event.action}</code>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {event.resourceType} {event.resourceId ? <span className="font-mono">#{event.resourceId.slice(0, 8)}</span> : null}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{event.actorIp ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data.totalPages > 1 ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= query.data.totalPages} onClick={() => setPage((current) => current + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
