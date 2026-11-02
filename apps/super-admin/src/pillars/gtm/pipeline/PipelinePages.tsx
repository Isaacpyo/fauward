import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@fauward/internal-rbac";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker } from "@/components/service-kit/TenantPicker";
import { consoleApi } from "@/lib/console-api";
import { apiErrorMessage } from "@/lib/console-api-error";

// gtm.pipeline (WP-4.18): PipelineBoardPage, DealDetailPage, ForecastPage. Deals are created and edited here (or
// imported from HubSpot when it is configured); the forecast is Σ amount × probability by close month over open deals.

export const STAGES = ["PROSPECTING", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
type Stage = (typeof STAGES)[number];
export type Deal = {
  id: string;
  name: string;
  stage: Stage;
  amount: string;
  probability: number;
  weighted: string;
  closeDate: string | null;
  ownerEmail: string | null;
  tenant: { id: string; name: string; slug: string | null } | null;
  notes: string | null;
  source: "CONSOLE" | "HUBSPOT";
  hubspotDealId: string | null;
  hubspotSyncedAt: string | null;
  wonAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type Hubspot = { vendor: string; configured: boolean; missing?: string[] };
type Board = { data: Deal[]; truncated: boolean; stages: Array<{ stage: Stage; count: number; amount: string }>; owners: string[]; hubspot: Hubspot | null };
type Forecast = {
  months: Array<{ month: string; deals: number; pipeline: string; weighted: string; won: string }>;
  totalWeighted: string;
  overdue: { deals: number; amount: string };
  unscheduled: { deals: number; amount: string };
};
type ImportResult = { created: number; updated: number; skippedLinked: number; total: number };

const KEY = ["gtm.pipeline"] as const;
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const input = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-normal text-[var(--color-text-primary)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const secondary = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

export const STAGE_TEXT: Record<Stage, string> = { PROSPECTING: "Prospecting", QUALIFIED: "Qualified", PROPOSAL: "Proposal", NEGOTIATION: "Negotiation", WON: "Won", LOST: "Lost" };

function day(value: string | null) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function PipelineNav({ active }: { active: "board" | "forecast" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Pipeline sections">
      {item("board", "/gtm/pipeline", "Board")}
      {item("forecast", "/gtm/pipeline/forecasting", "Forecast")}
    </nav>
  );
}

type Draft = { name: string; stage: Stage; amount: string; probability: string; closeDate: string; ownerEmail: string; notes: string; tenant: { id: string; name: string; slug: string | null } | null };

const EMPTY: Draft = { name: "", stage: "PROSPECTING", amount: "", probability: "", closeDate: "", ownerEmail: "", notes: "", tenant: null };

function draftFrom(deal: Deal): Draft {
  return {
    name: deal.name,
    stage: deal.stage,
    amount: deal.amount,
    probability: String(deal.probability),
    closeDate: deal.closeDate ?? "",
    ownerEmail: deal.ownerEmail ?? "",
    notes: deal.notes ?? "",
    tenant: deal.tenant ? { id: deal.tenant.id, name: deal.tenant.name, slug: deal.tenant.slug } : null
  };
}

/** The request body for a draft; on edit only what changed (and probability only when typed). */
function bodyFor(draft: Draft, original?: Deal) {
  const body: Record<string, unknown> = {};
  const set = (key: string, value: unknown, before: unknown) => {
    if (!original || value !== before) body[key] = value;
  };
  set("name", draft.name.trim(), original?.name);
  set("stage", draft.stage, original?.stage);
  set("amount", draft.amount.trim(), original?.amount);
  set("closeDate", draft.closeDate || null, original?.closeDate ?? null);
  set("ownerEmail", draft.ownerEmail.trim() || null, original?.ownerEmail ?? null);
  set("notes", draft.notes.trim() || null, original?.notes ?? null);
  set("tenantId", draft.tenant?.id ?? null, original?.tenant?.id ?? null);
  if (draft.probability.trim() !== "" && (!original || Number(draft.probability) !== original.probability)) body.probability = Number(draft.probability);
  return body;
}

function DealForm({ draft, onChange, readOnly }: { draft: Draft; onChange: (draft: Draft) => void; readOnly: boolean }) {
  const [picking, setPicking] = useState(false);
  const update = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={label}>
        Deal name
        <input aria-label="Deal name" value={draft.name} readOnly={readOnly} onChange={(event) => update({ name: event.target.value })} className={input} />
      </label>
      <label className={label}>
        Stage
        <select aria-label="Stage" value={draft.stage} disabled={readOnly} onChange={(event) => update({ stage: event.target.value as Stage })} className={input}>
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_TEXT[stage]}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Amount
        <input aria-label="Amount" inputMode="decimal" value={draft.amount} readOnly={readOnly} onChange={(event) => update({ amount: event.target.value })} className={input} />
      </label>
      <label className={label}>
        Probability % (blank = stage default)
        <input aria-label="Probability" type="number" min={0} max={100} value={draft.probability} readOnly={readOnly} onChange={(event) => update({ probability: event.target.value })} className={input} />
      </label>
      <label className={label}>
        Expected close
        <input aria-label="Expected close" type="date" value={draft.closeDate} readOnly={readOnly} onChange={(event) => update({ closeDate: event.target.value })} className={input} />
      </label>
      <label className={label}>
        Owner email
        <input aria-label="Owner email" type="email" value={draft.ownerEmail} readOnly={readOnly} onChange={(event) => update({ ownerEmail: event.target.value })} className={input} />
      </label>
      <div className="sm:col-span-2">
        <p className={label}>Linked tenant</p>
        <p className="mt-1 flex items-center gap-2 text-sm">
          {draft.tenant ? <TenantChip tenantId={draft.tenant.id} name={draft.tenant.name} slug={draft.tenant.slug} /> : "None"}
          {!readOnly ? (
            <>
              <button type="button" className={secondary} onClick={() => setPicking((value) => !value)}>
                {draft.tenant ? "Change" : "Link a tenant"}
              </button>
              {draft.tenant ? (
                <button type="button" className={secondary} onClick={() => update({ tenant: null })}>
                  Unlink
                </button>
              ) : null}
            </>
          ) : null}
        </p>
        {picking && !readOnly ? (
          <div className="mt-2">
            <TenantPicker
              label="Find the tenant"
              onSelect={(tenant) => {
                update({ tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } });
                setPicking(false);
              }}
            />
          </div>
        ) : null}
      </div>
      <label className={`${label} sm:col-span-2`}>
        Notes
        <textarea aria-label="Notes" rows={3} value={draft.notes} readOnly={readOnly} onChange={(event) => update({ notes: event.target.value })} className={input} />
      </label>
    </div>
  );
}

function Alerts({ message, error }: { message: string | null; error: string | null }) {
  return (
    <>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function PipelineBoardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const owner = params.get("owner") ?? "";
  const closeMonth = params.get("closeMonth") ?? "";
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const board = useQuery({
    queryKey: [...KEY, "board", owner, closeMonth],
    queryFn: async (): Promise<Board> => {
      const body = (await consoleApi.get<Partial<Board>>("/pipeline", { params: { ...(owner ? { owner } : {}), ...(closeMonth ? { closeMonth } : {}) } })).data;
      return { data: body.data ?? [], truncated: body.truncated ?? false, stages: body.stages ?? [], owners: body.owners ?? [], hubspot: body.hubspot ?? null };
    }
  });
  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await consoleApi.post<Deal>("/pipeline", body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
  const importDeals = useMutation({
    mutationFn: async () => (await consoleApi.post<ImportResult>("/pipeline/import/hubspot", {})).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });

  function filter(key: "owner" | "closeMonth", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  async function submit() {
    setError(null);
    setMessage(null);
    try {
      const deal = await create.mutateAsync(bodyFor(draft));
      setDraft(EMPTY);
      setCreating(false);
      navigate(`/gtm/pipeline/${encodeURIComponent(deal.id)}`);
    } catch (caught) {
      setError(apiErrorMessage(caught, "The deal could not be created."));
    }
  }

  async function runImport() {
    setError(null);
    setMessage(null);
    try {
      const result = await importDeals.mutateAsync();
      setMessage(`HubSpot import: ${result.created} new, ${result.updated} updated, ${result.skippedLinked} linked deals kept as they are.`);
    } catch (caught) {
      setError(apiErrorMessage(caught, "The HubSpot import failed."));
    }
  }

  const data = board.data;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Sales pipeline</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Deals by stage, soonest expected close first.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PipelineNav active="board" />
          {data?.hubspot?.configured ? (
            <PermissionButton permission="gtm.pipeline.write" disabled={importDeals.isPending} onClick={() => void runImport()} className={secondary}>
              {importDeals.isPending ? "Importing…" : "Import from HubSpot"}
            </PermissionButton>
          ) : null}
          <PermissionButton permission="gtm.pipeline.write" onClick={() => setCreating((value) => !value)} className={primary}>
            New deal
          </PermissionButton>
        </div>
      </header>
      {data?.hubspot && !data.hubspot.configured ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy={(data.hubspot.missing ?? []).join(", ") || "HUBSPOT_ACCESS_TOKEN"}>
          HubSpot is not connected: deals are entered here only, and the nightly import is skipped.
        </DegradedBanner>
      ) : null}
      <Alerts message={message} error={error} />
      {creating ? (
        <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="New deal">
          <h2 className="text-sm font-semibold">New deal</h2>
          <DealForm draft={draft} onChange={setDraft} readOnly={false} />
          <div className="flex gap-2">
            <button type="button" className={primary} disabled={create.isPending || !draft.name.trim() || !draft.amount.trim()} onClick={() => void submit()}>
              Create deal
            </button>
            <button type="button" className={secondary} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <label className={label}>
          Owner
          <select aria-label="Owner" value={owner} onChange={(event) => filter("owner", event.target.value)} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
            <option value="">Everyone</option>
            {(data?.owners ?? []).map((email) => (
              <option key={email} value={email}>
                {email}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Close month
          <input aria-label="Close month" type="month" value={closeMonth} onChange={(event) => filter("closeMonth", event.target.value)} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
        </label>
      </div>
      {board.isError ? <ConsoleApiErrorPanel error={board.error} onRetry={() => void board.refetch()} title="Unable to load the pipeline" /> : null}
      {data && data.data.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No deal matches.</p> : null}
      {data && data.data.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const summary = data.stages.find((row) => row.stage === stage);
            const deals = data.data.filter((deal) => deal.stage === stage);
            return (
              <section key={stage} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-50)] p-2" aria-label={STAGE_TEXT[stage]} data-testid={`stage-${stage}`}>
                <h2 className="px-1 text-xs font-semibold">
                  {STAGE_TEXT[stage]} · {summary?.count ?? 0} · {summary?.amount ?? "0.00"}
                </h2>
                <ul className="mt-2 space-y-2">
                  {deals.map((deal) => (
                    <li key={deal.id} className="rounded-md border border-[var(--color-border)] bg-white p-2 text-xs" data-testid="deal-card">
                      <Link to={`/gtm/pipeline/${encodeURIComponent(deal.id)}`} className="font-semibold underline">
                        {deal.name}
                      </Link>
                      <p className="mt-1 tabular-nums">
                        {deal.amount} · {deal.probability}%
                      </p>
                      <p className="text-[var(--color-text-muted)]">
                        Close {day(deal.closeDate)}
                        {deal.ownerEmail ? ` · ${deal.ownerEmail}` : ""}
                      </p>
                      {deal.tenant ? <TenantChip tenantId={deal.tenant.id} name={deal.tenant.name} slug={deal.tenant.slug} /> : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
      {data?.truncated ? <p className="text-xs text-[var(--color-text-muted)]">The board is cut off; filter by owner or close month to narrow it.</p> : null}
    </div>
  );
}

export function DealDetailPage() {
  const { dealId = "" } = useParams();
  const queryClient = useQueryClient();
  const canWrite = usePermission("gtm.pipeline.write") === true;
  const deal = useQuery({ queryKey: [...KEY, "deal", dealId], queryFn: async () => (await consoleApi.get<Deal>(`/pipeline/${encodeURIComponent(dealId)}`)).data });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await consoleApi.patch<Deal>(`/pipeline/${encodeURIComponent(dealId)}`, body)).data,
    onSuccess: (updated) => {
      queryClient.setQueryData([...KEY, "deal", dealId], updated);
      void queryClient.invalidateQueries({ queryKey: [...KEY, "board"] });
      void queryClient.invalidateQueries({ queryKey: [...KEY, "forecast"] });
    }
  });
  const data = deal.data;
  useEffect(() => {
    if (data) setDraft(draftFrom(data));
  }, [data]);
  const body = data ? bodyFor(draft, data) : {};
  const dirty = Object.keys(body).length > 0;

  async function submit() {
    setError(null);
    setMessage(null);
    try {
      const updated = await save.mutateAsync(body);
      setMessage(updated.stage === "WON" && data?.stage !== "WON" ? "Deal marked won." : "Deal saved.");
    } catch (caught) {
      setError(apiErrorMessage(caught, "The deal could not be saved."));
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{data?.name ?? "Deal"}</h1>
          {data ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
              {STAGE_TEXT[data.stage]} · {data.amount} · {data.probability}% (weighted {data.weighted})
              {data.tenant ? <TenantChip tenantId={data.tenant.id} name={data.tenant.name} slug={data.tenant.slug} /> : null}
              {data.source === "HUBSPOT" ? ` · imported from HubSpot${data.tenant ? " (linked: edits here win)" : ""}` : ""}
            </p>
          ) : null}
        </div>
        <PipelineNav active="board" />
      </header>
      <Alerts message={message} error={error} />
      {deal.isError ? <ConsoleApiErrorPanel error={deal.error} onRetry={() => void deal.refetch()} title="Unable to load this deal" /> : null}
      {data ? (
        <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Deal">
          <DealForm draft={draft} onChange={setDraft} readOnly={!canWrite} />
          <PermissionButton permission="gtm.pipeline.write" disabled={save.isPending || !dirty} onClick={() => void submit()} className={primary}>
            Save deal
          </PermissionButton>
        </section>
      ) : null}
    </div>
  );
}

export function ForecastPage() {
  const [months, setMonths] = useState(6);
  const forecast = useQuery({ queryKey: [...KEY, "forecast", months], queryFn: async () => (await consoleApi.get<Forecast>("/pipeline/forecasting", { params: { months } })).data });
  const data = forecast.data;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Forecast</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Weighted = Σ amount × probability over open deals, by expected close month. Won shows deals already closed in that month.</p>
        </div>
        <PipelineNav active="forecast" />
      </header>
      <label className={label}>
        Months
        <select aria-label="Months" value={months} onChange={(event) => setMonths(Number(event.target.value))} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value={3}>3</option>
          <option value={6}>6</option>
          <option value={12}>12</option>
        </select>
      </label>
      {forecast.isError ? <ConsoleApiErrorPanel error={forecast.error} onRetry={() => void forecast.refetch()} title="Unable to load the forecast" /> : null}
      {data ? (
        <>
          <table className="min-w-full rounded-lg border border-[var(--color-border)] bg-white text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2 text-right">Open deals</th>
                <th className="px-3 py-2 text-right">Pipeline</th>
                <th className="px-3 py-2 text-right">Weighted</th>
                <th className="px-3 py-2 text-right">Won</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.months.map((row) => (
                <tr key={row.month} data-testid="forecast-row">
                  <td className="px-3 py-2">{monthLabel(row.month)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.deals}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.pipeline}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{row.weighted}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.won}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm" data-testid="forecast-total">
            Weighted total: <span className="font-semibold tabular-nums">{data.totalWeighted}</span>
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Not in the table: {data.overdue.deals} open deal{data.overdue.deals === 1 ? "" : "s"} past their close date ({data.overdue.amount}) and {data.unscheduled.deals} without one ({data.unscheduled.amount}).
          </p>
        </>
      ) : null}
    </div>
  );
}
