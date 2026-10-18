import { useSearchParams } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { type JitState, useJitHistory } from "./api";
import { JitTable } from "./components/JitTable";
import { JitNav } from "./components/JitNav";

const card = "rounded-lg border border-[var(--color-border)] bg-white p-4";
const field = "mt-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const STATES: JitState[] = ["PENDING", "ACTIVE", "EXPIRED", "DENIED", "REVOKED"];

function isState(value: string | null): value is JitState {
  return value !== null && (STATES as string[]).includes(value);
}

export function JitHistoryPage() {
  const [params, setParams] = useSearchParams();
  const stateParam = params.get("state");
  const state = isState(stateParam) ? stateParam : undefined;
  const permission = params.get("permission") ?? undefined;
  const history = useJitHistory({ state, permission });
  const rows = history.data?.pages.flatMap((page) => page.data) ?? [];

  function setFilter(key: "state" | "permission", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Access history</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Every JIT request with its approvals, denials and expiry. Each decision is also in the audit log.</p>
        <JitNav />
      </header>
      <section className={card}>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">
            State
            <select aria-label="State" value={state ?? ""} onChange={(event) => setFilter("state", event.target.value)} className={`${field} block`}>
              <option value="">All</option>
              {STATES.map((item) => (
                <option key={item} value={item}>
                  {item.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">
            Permission
            <input aria-label="Permission" defaultValue={permission ?? ""} onBlur={(event) => setFilter("permission", event.target.value.trim())} placeholder="e.g. revenue.invoices.read" className={`${field} block font-mono`} />
          </label>
        </div>
        {history.isError ? <ConsoleApiErrorPanel error={history.error} onRetry={() => void history.refetch()} title="Unable to load the history" /> : null}
        {history.isLoading ? <p className="mt-3 text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
        {history.data ? <JitTable testId="jit-history" rows={rows} columns={["requester", "approvals", "outcome"]} empty="No requests match these filters." /> : null}
        {history.hasNextPage ? (
          <button type="button" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()} className="mt-3 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
            {history.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </section>
    </div>
  );
}
