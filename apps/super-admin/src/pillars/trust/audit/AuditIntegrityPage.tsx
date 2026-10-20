import { HealthPill } from "@fauward/internal-ui";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { useVerifyAuditChain } from "./api";

export function AuditIntegrityPage() {
  const verify = useVerifyAuditChain();
  const result = verify.data;
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit integrity</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Runs the current verifier over the platform audit hash chain.</p>
      </header>
      <DegradedBanner variant="not-wired" fixedBy="WP-5.1">
        Two hash schemes write to this log today (the console audit writer and the platform audit service), so the verifier can report a break at the first entry written by the other scheme. A single scheme and a batch verifier with stored runs arrive in Phase 5.
      </DegradedBanner>
      <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
        <PermissionButton permission="trust.audit.export" onClick={() => verify.mutate()} disabled={verify.isPending} className="rounded-md bg-[var(--fauward-navy)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {verify.isPending ? "Verifying…" : "Verify now"}
        </PermissionButton>
        {verify.isError ? <ConsoleApiErrorPanel error={verify.error} title="Verification failed to run" /> : null}
        {result ? (
          <div data-testid="audit-verify-result" className="space-y-1">
            <HealthPill status={result.ok ? "green" : "red"} label={result.ok ? "Chain verified" : "Chain broken"} />
            <p className="font-mono text-xs text-[var(--color-text-muted)]">Verified at {result.verifiedAt}</p>
            <p className="font-mono text-xs text-[var(--color-text-muted)]">{result.ok ? `${result.checked ?? 0} entries checked` : `First mismatch at entry ${result.failedAt ?? "unknown"}`}</p>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Not run in this session.</p>
        )}
      </section>
    </div>
  );
}
