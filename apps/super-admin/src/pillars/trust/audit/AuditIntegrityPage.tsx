import { HealthPill } from "@fauward/internal-ui";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { useAuditVerification, useVerifyAuditChain, type AuditVerificationRun } from "./api";

const REASONS: Record<string, string> = {
  HASH_MISMATCH: "an entry's content no longer matches its hash",
  PREVIOUS_HASH_MISMATCH: "an entry does not link to the one before it (missing or reordered entries)",
  LEGACY_AFTER_CUTOVER: "an entry with the old hash scheme appears after the cut-over",
  UNKNOWN_HASH_VERSION: "an entry has an unknown hash version"
};

function RunSummary({ run }: { run: AuditVerificationRun }) {
  const result = run.result;
  const by = run.triggeredBy === "SCHEDULE" ? "nightly schedule" : "a staff member";
  if (run.status !== "SUCCEEDED" || !result) {
    return (
      <div data-testid="audit-verify-result" className="space-y-1">
        <HealthPill status="amber" label={run.status === "RUNNING" ? "Verification running" : "Verification did not finish"} />
        <p className="font-mono text-xs text-[var(--color-text-muted)]">Started {run.startedAt} by the {by}</p>
        {run.error ? <p className="text-xs text-[var(--color-text-muted)]">{run.error}</p> : null}
      </div>
    );
  }
  return (
    <div data-testid="audit-verify-result" className="space-y-1">
      <HealthPill status={result.ok ? "green" : "red"} label={result.ok ? "Chain verified" : "Chain broken"} />
      <p className="font-mono text-xs text-[var(--color-text-muted)]">Verified at {run.finishedAt ?? run.startedAt} by the {by}</p>
      <p className="font-mono text-xs text-[var(--color-text-muted)]">
        {result.checked} entries checked{result.legacy > 0 ? `, ${result.legacy} written before the single hash scheme (accepted up to seq ${result.cutoverSeq ?? result.legacy})` : ""}
      </p>
      {result.ok ? null : (
        <p className="text-sm text-[var(--color-text-primary)]">
          First break at seq {result.firstBrokenSeq ?? "unknown"} (entry {result.firstBrokenId ?? "unknown"}): {REASONS[result.reason ?? ""] ?? result.reason ?? "unknown reason"}.
        </p>
      )}
    </div>
  );
}

export function AuditIntegrityPage() {
  const last = useAuditVerification();
  const verify = useVerifyAuditChain();
  const run = verify.data ?? last.data?.data ?? null;
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit integrity</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Every platform audit entry is chained to the one before it by a hash. The chain is verified every night and on demand.
        </p>
      </header>
      <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
        <PermissionButton permission="trust.audit.export" onClick={() => verify.mutate()} disabled={verify.isPending} className="rounded-md bg-[var(--fauward-navy)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {verify.isPending ? "Verifying…" : "Verify now"}
        </PermissionButton>
        {verify.isError ? <ConsoleApiErrorPanel error={verify.error} title="Verification failed to run" /> : null}
        {last.isError ? <ConsoleApiErrorPanel error={last.error} title="Could not load the last verification" /> : null}
        {last.isPending ? <p className="text-sm text-[var(--color-text-muted)]">Loading the last verification…</p> : null}
        {run ? <RunSummary run={run} /> : last.isSuccess ? <p className="text-sm text-[var(--color-text-muted)]">The chain has not been verified yet.</p> : null}
      </section>
    </div>
  );
}
