import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { type AppealStatus, useAppeal, useAppeals, useDecideAppeal, words } from "./api";
import { SafetyNav } from "./SafetyNav";

const TABS: Array<{ id: AppealStatus | ""; label: string }> = [
  { id: "PENDING", label: "Waiting for a decision" },
  { id: "INFO_REQUESTED", label: "Waiting for the tenant" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "", label: "All" }
];

const statusTone: Record<AppealStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  INFO_REQUESTED: "border-blue-200 bg-blue-50 text-blue-700",
  APPROVED: "border-green-200 bg-green-50 text-green-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700"
};

/** Suspension appeals (L3): tenants appeal from the suspension notice; staff decide here. */
export function AppealsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "PENDING") as AppealStatus | "";
  const appeals = useAppeals({ status: status || undefined });
  const rows = appeals.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div className="space-y-4">
      <SafetyNav current="appeals" />
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Appeals</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Approving lifts the suspension the appeal was filed against.</p>
      </header>
      <nav aria-label="Appeal status" className="flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id || "all"}
            type="button"
            aria-pressed={status === tab.id}
            onClick={() => setParams(tab.id === "PENDING" ? {} : { status: tab.id || "" }, { replace: true })}
            className={`rounded-md border px-3 py-1.5 text-sm ${status === tab.id ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)] bg-white"}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {appeals.isError ? <ConsoleApiErrorPanel error={appeals.error} onRetry={() => void appeals.refetch()} title="Unable to load appeals" /> : null}
      {!appeals.isError ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {rows.map((appeal) => (
            <li key={appeal.id} data-testid="appeal-row" onClick={() => navigate(`/trust/safety/appeals/${appeal.id}`)} className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--color-surface-50)]">
              <span className="flex min-w-0 items-center gap-2">
                <TenantChip tenantId={appeal.tenant.id} name={appeal.tenant.name} slug={appeal.tenant.slug} />
                <Link to={`/trust/safety/appeals/${appeal.id}`} onClick={(event) => event.stopPropagation()} className="max-w-md truncate text-sm hover:underline">
                  {appeal.message}
                </Link>
              </span>
              <span className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                {appeal.suspension ? `${words(appeal.suspension.source)} cause` : "No linked cause"}
                <span className={`rounded-full border px-2 py-0.5 font-semibold ${statusTone[appeal.status]}`}>{words(appeal.status)}</span>
                {new Date(appeal.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
          {!appeals.isLoading && rows.length === 0 ? <li className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No appeals here.</li> : null}
        </ul>
      ) : null}
      {appeals.hasNextPage ? (
        <button type="button" onClick={() => void appeals.fetchNextPage()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold">
          Load more
        </button>
      ) : null}
    </div>
  );
}

type Decision = "APPROVE" | "REJECT" | "REQUEST_INFO";

const DECISION_COPY: Record<Decision, { title: string; confirm: string; message: string; required: boolean }> = {
  APPROVE: { title: "Approve the appeal", confirm: "Approve and lift", message: "Message to the tenant (optional)", required: false },
  REJECT: { title: "Reject the appeal", confirm: "Reject", message: "Resolution shown to the tenant", required: true },
  REQUEST_INFO: { title: "Ask the tenant a question", confirm: "Send question", message: "Question shown to the tenant", required: true }
};

export function AppealDetailPage() {
  const { id = "" } = useParams();
  const detail = useAppeal(id);
  const decide = useDecideAppeal();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [message, setMessage] = useState("");

  if (detail.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading appeal…</p>;
  if (detail.isError) return <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the appeal" />;
  if (!detail.data) return null;
  const { appeal, context } = detail.data;
  const open = appeal.status === "PENDING" || appeal.status === "INFO_REQUESTED";
  const copy = decision ? DECISION_COPY[decision] : null;
  const start = (next: Decision) => {
    setMessage("");
    setDecision(next);
  };

  return (
    <div className="space-y-4">
      <SafetyNav current="appeals" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/trust/safety/appeals" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
            ← Appeals
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">
            Appeal from <TenantChip tenantId={appeal.tenant.id} name={appeal.tenant.name} slug={appeal.tenant.slug} />
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {words(appeal.status)} · filed {new Date(appeal.createdAt).toLocaleString()} {appeal.contactEmail ? `· contact ${appeal.contactEmail}` : ""}
          </p>
        </div>
        {open ? (
          <div className="flex flex-wrap gap-2">
            <PermissionButton permission="trust.safety.suspend" onClick={() => start("APPROVE")} className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              Approve
            </PermissionButton>
            <PermissionButton permission="trust.safety.suspend" onClick={() => start("REJECT")} className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
              Reject
            </PermissionButton>
            <PermissionButton permission="trust.safety.suspend" onClick={() => start("REQUEST_INFO")} disabled={appeal.status === "INFO_REQUESTED"} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              Ask a question
            </PermissionButton>
          </div>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
          <h2 className="font-semibold">What the tenant wrote</h2>
          <p className="whitespace-pre-wrap" data-testid="appeal-message">
            {appeal.message}
          </p>
          {appeal.infoRequest ? (
            <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-semibold text-blue-800">Fauward asked{appeal.infoRequestedAt ? ` · ${new Date(appeal.infoRequestedAt).toLocaleString()}` : ""}</p>
              <p className="mt-1 whitespace-pre-wrap">{appeal.infoRequest}</p>
            </div>
          ) : null}
          {appeal.tenantReply ? (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-50)] p-3" data-testid="appeal-tenant-reply">
              <p className="text-xs font-semibold">Tenant answered{appeal.tenantRepliedAt ? ` · ${new Date(appeal.tenantRepliedAt).toLocaleString()}` : ""}</p>
              <p className="mt-1 whitespace-pre-wrap">{appeal.tenantReply}</p>
            </div>
          ) : null}
          {appeal.resolution ? (
            <div className="rounded-md border border-[var(--color-border)] p-3">
              <p className="text-xs font-semibold">Resolution sent to the tenant</p>
              <p className="mt-1 whitespace-pre-wrap">{appeal.resolution}</p>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
          <h2 className="font-semibold">Appealed suspension</h2>
          {appeal.suspension ? (
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
              <dt className="text-[var(--color-text-muted)]">Cause</dt>
              <dd>
                {words(appeal.suspension.source)} · {words(appeal.suspension.category)} ({words(appeal.suspension.status)})
              </dd>
              <dt className="text-[var(--color-text-muted)]">Internal reason</dt>
              <dd>{appeal.suspension.reason}</dd>
              <dt className="text-[var(--color-text-muted)]">Tenant sees</dt>
              <dd>{appeal.suspension.publicReason ?? "—"}</dd>
              <dt className="text-[var(--color-text-muted)]">Since</dt>
              <dd>{new Date(appeal.suspension.createdAt).toLocaleString()}</dd>
            </dl>
          ) : (
            <p className="text-[var(--color-text-muted)]">The appeal is not linked to a suspension cause; approving it changes nothing on the tenant.</p>
          )}
          <h3 className="pt-2 font-semibold">Other active causes</h3>
          {context.activeSuspensions.filter((row) => row.id !== appeal.suspension?.id).length === 0 ? (
            <p className="text-[var(--color-text-muted)]">None — approving reactivates the tenant.</p>
          ) : (
            <ul className="space-y-1">
              {context.activeSuspensions
                .filter((row) => row.id !== appeal.suspension?.id)
                .map((row) => (
                  <li key={row.id}>
                    {words(row.source)}: {row.reason}
                  </li>
                ))}
            </ul>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">{context.previousAppeals} earlier appeal(s) from this tenant.</p>
        </section>
      </div>

      <ActionDialog
        open={decision !== null}
        title={copy?.title ?? ""}
        confirmLabel={copy?.confirm ?? ""}
        dangerous
        validate={() => (copy?.required && message.trim().length < 10 ? "Write the text the tenant will see (at least 10 characters)." : null)}
        onSubmit={async (reason) => decide.mutateAsync({ id: appeal.id, decision: decision!, reason, ...(message.trim() ? { message: message.trim() } : {}) })}
        onClose={() => setDecision(null)}
      >
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          {copy?.message}
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
        </label>
      </ActionDialog>
    </div>
  );
}
