import { HealthPill } from "@fauward/internal-ui";
import { useMutation } from "@tanstack/react-query";
import { verifyAuditChain } from "./api";

export function AuditIntegrityPage() {
  const mutation = useMutation({ mutationFn: verifyAuditChain });
  const result = mutation.data;
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit integrity</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Verify the platform audit hash chain.</p>
      </header>
      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <button type="button" className="rounded-md bg-[var(--fauward-navy)] px-4 py-2 text-sm font-semibold text-white" onClick={() => mutation.mutate()}>
          Verify now
        </button>
        {result ? (
          <div className="mt-4 space-y-2">
            <HealthPill status={result.ok ? "green" : "red"} label={result.ok ? "Chain verified" : "Chain broken"} />
            <p className="font-mono text-xs text-[var(--color-text-muted)]">Verified at {result.verifiedAt}</p>
            <p className="font-mono text-xs text-[var(--color-text-muted)]">{result.ok ? `${result.checked ?? 0} entries checked` : `Failed at ${result.failedAt}`}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
