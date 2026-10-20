import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { type Signal, useCreateSignal, useDecideSignal, useSignals, words } from "./api";
import { SafetyNav } from "./SafetyNav";

const field = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";
const TABS = [
  { id: "", label: "All" },
  { id: "FRAUD", label: "Fraud" },
  { id: "AUP", label: "Acceptable use" }
];

function ReportDialog({ open, onClose, defaultCategory }: { open: boolean; onClose: () => void; defaultCategory: "FRAUD" | "AUP" }) {
  const create = useCreateSignal();
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [category, setCategory] = useState<"FRAUD" | "AUP">(defaultCategory);
  const [severity, setSeverity] = useState("MEDIUM");
  const [summary, setSummary] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  useEffect(() => {
    if (open) {
      setTenant(null);
      setCategory(defaultCategory);
      setSeverity("MEDIUM");
      setSummary("");
      setEvidenceUrl("");
    }
  }, [open, defaultCategory]);
  return (
    <ActionDialog
      open={open}
      title="Report a signal"
      description="A manual fraud flag or an acceptable-use report. It joins the queue; suspending is a separate decision."
      confirmLabel="Report"
      validate={() => (!tenant ? "Choose a tenant." : summary.trim().length < 10 ? "Describe what was reported (at least 10 characters)." : null)}
      onSubmit={async () => create.mutateAsync({ tenantId: tenant!.id, category, severity, summary: summary.trim(), ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {}) })}
      onClose={onClose}
    >
      {tenant ? (
        <p className="text-sm">
          Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />{" "}
          <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline" onClick={() => setTenant(null)}>
            Change
          </button>
        </p>
      ) : (
        <TenantPicker label="Tenant" onSelect={setTenant} />
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value as "FRAUD" | "AUP")} className={field}>
            <option value="FRAUD">Fraud</option>
            <option value="AUP">Acceptable use</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Severity
          <select value={severity} onChange={(event) => setSeverity(event.target.value)} className={field}>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => (
              <option key={value} value={value}>
                {words(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        What was reported
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} className={field} />
      </label>
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Evidence link (optional)
        <input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} className={field} />
      </label>
    </ActionDialog>
  );
}

function DecisionDialog({ signal, onClose }: { signal: Signal | null; onClose: () => void }) {
  const decide = useDecideSignal();
  const [decision, setDecision] = useState<"DISMISS" | "WARN" | "SUSPEND">("DISMISS");
  const [tenantMessage, setTenantMessage] = useState("");
  useEffect(() => {
    if (signal) {
      setDecision("DISMISS");
      setTenantMessage("");
    }
  }, [signal]);
  if (!signal) return null;
  return (
    <ActionDialog
      open
      title={`Decide: ${signal.category === "AUP" ? "acceptable use" : "fraud"} signal`}
      description={
        <>
          <TenantChip tenantId={signal.tenant.id} name={signal.tenant.name} slug={signal.tenant.slug} /> — {signal.summary}
        </>
      }
      confirmLabel={decision === "SUSPEND" ? "Suspend tenant" : decision === "WARN" ? "Send warning" : "Dismiss"}
      dangerous
      validate={() => (decision === "WARN" && tenantMessage.trim().length < 10 ? "Write the warning the tenant will see (at least 10 characters)." : null)}
      onSubmit={async (reason) => decide.mutateAsync({ id: signal.id, decision, reason, ...(tenantMessage.trim() ? { tenantMessage: tenantMessage.trim() } : {}) })}
      onClose={onClose}
    >
      <fieldset className="space-y-1 text-sm">
        <legend className="text-xs font-semibold text-[var(--color-text-muted)]">Decision</legend>
        {(
          [
            ["DISMISS", "Dismiss — no action"],
            ["WARN", "Warn the tenant's admins"],
            ["SUSPEND", `Suspend the tenant (${signal.category} cause)`]
          ] as const
        ).map(([value, text]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="signal-decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />
            {text}
          </label>
        ))}
      </fieldset>
      {decision !== "DISMISS" ? (
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          {decision === "WARN" ? "Warning shown to the tenant" : "Reason shown in the tenant's suspension notice (optional)"}
          <textarea value={tenantMessage} onChange={(event) => setTenantMessage(event.target.value)} rows={3} className={field} />
        </label>
      ) : null}
    </ActionDialog>
  );
}

/** Fraud and acceptable-use signals (one queue, `category` filter; ACC-SAF-6). */
export function SignalsPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const status = params.get("status") ?? "OPEN";
  const signals = useSignals({ category: category || undefined, status: status === "ALL" ? undefined : status });
  const rows = signals.data?.pages.flatMap((page) => page.data) ?? [];
  const [reporting, setReporting] = useState(false);
  const [deciding, setDeciding] = useState<Signal | null>(null);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <SafetyNav current="signals" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Signals</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Stripe Radar warnings, manual fraud flags and acceptable-use reports.</p>
        </div>
        <PermissionButton permission="trust.safety.suspend" onClick={() => setReporting(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          Report a signal
        </PermissionButton>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Category" className="flex gap-1">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" aria-pressed={category === tab.id} onClick={() => set("category", tab.id)} className={`rounded-md border px-3 py-1.5 text-sm ${category === tab.id ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)] bg-white"}`}>
              {tab.label}
            </button>
          ))}
        </nav>
        <select aria-label="Status" value={status} onChange={(event) => set("status", event.target.value === "OPEN" ? "" : event.target.value)} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
          <option value="OPEN">Open</option>
          <option value="CLOSED">Decided</option>
          <option value="ALL">All</option>
        </select>
      </div>
      {signals.isError ? <ConsoleApiErrorPanel error={signals.error} onRetry={() => void signals.refetch()} title="Unable to load signals" /> : null}
      {!signals.isError ? (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Received</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Signal</th>
                <th className="px-3 py-2">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((signal) => (
                <tr key={signal.id} data-testid="signal-row">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{new Date(signal.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <TenantChip tenantId={signal.tenant.id} name={signal.tenant.name} slug={signal.tenant.slug} />
                  </td>
                  <td className="px-3 py-2 text-xs">{signal.category === "AUP" ? "Acceptable use" : "Fraud"}</td>
                  <td className="px-3 py-2 text-xs">{words(signal.severity)}</td>
                  <td className="px-3 py-2 text-xs">{words(signal.source)}</td>
                  <td className="max-w-xs px-3 py-2 text-xs">{signal.summary}</td>
                  <td className="px-3 py-2 text-xs">
                    {signal.status === "CLOSED" ? (
                      <span title={signal.decisionNote ?? undefined}>{words(signal.decision ?? "closed")}</span>
                    ) : (
                      <PermissionButton permission="trust.safety.suspend" onClick={() => setDeciding(signal)} className="rounded-md border border-[var(--color-border)] px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                        Decide
                      </PermissionButton>
                    )}
                  </td>
                </tr>
              ))}
              {!signals.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    No signals here. Stripe Radar warnings appear automatically; staff can report others.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {signals.isLoading ? <p className="p-3 text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
          {signals.hasNextPage ? (
            <div className="border-t border-[var(--color-border)] p-2 text-center">
              <button type="button" onClick={() => void signals.fetchNextPage()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold">
                Load more
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      <p className="text-xs text-[var(--color-text-muted)]">
        Automatic rules are listed on <Link to="/trust/safety/rules" className="font-semibold text-[var(--fauward-navy)] hover:underline">Rules</Link>.
      </p>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} defaultCategory={category === "AUP" ? "AUP" : "FRAUD"} />
      <DecisionDialog signal={deciding} onClose={() => setDeciding(null)} />
    </div>
  );
}
