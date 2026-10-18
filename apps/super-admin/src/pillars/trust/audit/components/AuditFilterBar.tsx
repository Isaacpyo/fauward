import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { TenantPicker } from "@/components/service-kit/TenantPicker";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AUDIT_FILTER_KEYS, type AuditFilters, isoToLocalInput, localInputToIso } from "../api";

/** Typing pauses this long before the URL (and so the query) changes: at most one request per 300 ms (ACC-AUD-1). */
export const AUDIT_SEARCH_DEBOUNCE_MS = 300;

const TEXT_KEYS = ["actor", "action", "targetId", "q"] as const;
type TextKey = (typeof TEXT_KEYS)[number];
type TextFilters = Record<TextKey, string>;

const TARGET_TYPES = ["tenant", "user", "staff_user", "role_assignment", "invoice", "refund", "credit_note", "jit_request", "impersonation_session", "audit_log"];

const input = "h-9 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm outline-none focus:border-[var(--fauward-navy)]";

/** Filters live in the URL (shareable, survive reload); text fields are debounced together into one URL update. */
export function useAuditUrlFilters() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState<TextFilters>(() => ({ actor: params.get("actor") ?? "", action: params.get("action") ?? "", targetId: params.get("targetId") ?? "", q: params.get("q") ?? "" }));
  const debounced = useDebouncedValue(text, AUDIT_SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    const next = new URLSearchParams(params);
    for (const key of TEXT_KEYS) {
      const value = debounced[key].trim();
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [debounced, params, setParams]);

  const filters = useMemo(() => {
    const value: AuditFilters = {};
    for (const key of AUDIT_FILTER_KEYS) {
      const raw = params.get(key);
      if (raw) value[key] = raw;
    }
    return value;
  }, [params]);

  function setFilter(key: "targetType" | "tenantId" | "from" | "to", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function clear() {
    setText({ actor: "", action: "", targetId: "", q: "" });
    setParams(new URLSearchParams(), { replace: true });
  }

  return { filters, text, setText: (key: TextKey, value: string) => setText((prev) => ({ ...prev, [key]: value })), setFilter, clear };
}

export function AuditFilterBar({ state, tenantLabel }: { state: ReturnType<typeof useAuditUrlFilters>; tenantLabel?: string | null }) {
  const { filters, text, setText, setFilter, clear } = state;
  const [pickingTenant, setPickingTenant] = useState(false);
  const active = Object.keys(filters).length > 0;

  return (
    <section aria-label="Audit filters" className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-3">
      <div className="grid gap-2 md:grid-cols-4">
        <input aria-label="Free text" placeholder="Search actor, action, target, reason" value={text.q} onChange={(event) => setText("q", event.target.value)} className={`${input} md:col-span-2`} />
        <input aria-label="Actor" placeholder="Actor email or id" value={text.actor} onChange={(event) => setText("actor", event.target.value)} className={input} />
        <input aria-label="Action" placeholder="Action, e.g. tenant.suspend" value={text.action} onChange={(event) => setText("action", event.target.value)} className={input} />
        <select aria-label="Target type" value={filters.targetType ?? ""} onChange={(event) => setFilter("targetType", event.target.value)} className={input}>
          <option value="">Any target type</option>
          {TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input aria-label="Target id" placeholder="Target id" value={text.targetId} onChange={(event) => setText("targetId", event.target.value)} className={input} />
        <input aria-label="From" type="datetime-local" value={isoToLocalInput(filters.from)} onChange={(event) => setFilter("from", localInputToIso(event.target.value))} className={input} />
        <input aria-label="To" type="datetime-local" value={isoToLocalInput(filters.to)} onChange={(event) => setFilter("to", localInputToIso(event.target.value))} className={input} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">Tenant</span>
        {filters.tenantId ? (
          <>
            <span data-testid="audit-tenant-filter" className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-xs">
              {tenantLabel ?? filters.tenantId}
            </span>
            <button type="button" onClick={() => setFilter("tenantId", "")} className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
              Any tenant
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setPickingTenant((open) => !open)} className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
            {pickingTenant ? "Cancel" : "Choose a tenant"}
          </button>
        )}
        {active ? (
          <button type="button" onClick={clear} className="ml-auto text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            Clear all filters
          </button>
        ) : null}
      </div>
      {pickingTenant && !filters.tenantId ? (
        <div className="max-w-md">
          <TenantPicker
            label="Filter by tenant"
            onSelect={(tenant) => {
              setFilter("tenantId", tenant.id);
              setPickingTenant(false);
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
