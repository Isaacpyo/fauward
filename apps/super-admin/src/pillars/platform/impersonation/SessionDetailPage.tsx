import { Link, useParams } from "react-router-dom";
import { DiffViewer } from "@fauward/internal-ui";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { toConsoleApiError } from "@/lib/console-api-error";
import { useSessionDetail } from "./api";

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

/** One staff session and the tenant audit rows it wrote (actorType IMPERSONATOR, metadata.impersonationSessionId). */
export function SessionDetailPage() {
  const { id = "" } = useParams();
  const detail = useSessionDetail(id);
  if (detail.isError) {
    if (toConsoleApiError(detail.error).status === 404) {
      return (
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h1 className="text-lg font-semibold">Session not found</h1>
          <Link to="/platform/impersonation" className="mt-2 inline-block text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
            Back to the Impersonation Center
          </Link>
        </div>
      );
    }
    return <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  if (!detail.data) return <p className="text-sm text-[var(--color-text-muted)]">Loading session…</p>;
  const { session, auditRows } = detail.data;
  const endedAt = session.endedAt ?? session.revokedAt;

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <Link to="/platform/impersonation" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
          Impersonation Center
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">
          Staff session on <TenantChip tenantId={session.targetTenant.id} name={session.targetTenant.name} slug={session.targetTenant.slug} />
        </h1>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Staff</dt>
            <dd>{session.platformUser.name ?? session.platformUser.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Access</dt>
            <dd>{session.scopes.includes("write") ? "Read and write" : "Read-only"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Reason</dt>
            <dd>{session.reason}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Started / portal opened</dt>
            <dd>
              {when(session.createdAt)} / {when(session.exchangedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Ended</dt>
            <dd>{endedAt ? `${when(endedAt)} (${(session.endedReason ?? "ended").toLowerCase()})` : new Date(session.expiresAt) > new Date() ? `Active until ${when(session.expiresAt)}` : `Expired ${when(session.expiresAt)}`}</dd>
          </div>
        </dl>
      </header>
      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Tenant audit trail ({auditRows.length})</h2>
        {auditRows.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Nothing was written in the tenant's audit log during this session.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--color-border)]">
            {auditRows.map((row) => (
              <li key={row.id} data-testid="session-audit-row" className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{when(row.timestamp)}</span>
                  <span className="font-semibold">{row.action}</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 text-[11px] font-semibold text-amber-800">{row.actorType}</span>
                  {row.resourceType ? (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {row.resourceType} {row.resourceId}
                    </span>
                  ) : null}
                </div>
                {row.metadata ? <DiffViewer before={null} after={row.metadata} splitView={false} className="mt-1" /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
