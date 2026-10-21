import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { consoleApi } from "@/lib/console-api";
import { apiErrorMessage } from "@/lib/console-api-error";

// customer.qbr (WP-4.9): QbrListPage (decks + tenants due), QbrTenantPage (decks, generate), QbrDeckPage (sections,
// notes, ready, share, HTML download). Decks are built by the customer.qbr-generate job from real data.

type TenantRef = { id: string; name: string; slug: string | null };
type Deck = { id: string; tenant: TenantRef; period: string | null; periodStart: string; periodEnd: string; status: string; notes: string | null; generatedAt: string | null; error: string | null; sharedAt: string | null; updatedAt: string };
type Section = { key: string; title: string; empty: boolean; emptyText: string | null; items: Array<{ label: string; value: string }>; notes: string[] };

const KEY = ["customer.qbr"] as const;

const STATUS_TONE: Record<string, string> = {
  GENERATING: "bg-blue-100 text-blue-800",
  DRAFT: "bg-slate-100 text-slate-700",
  READY: "bg-amber-100 text-amber-900",
  SHARED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800"
};

function Pill({ status }: { status: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status] ?? "bg-slate-100 text-slate-700"}`}>{status.toLowerCase()}</span>;
}

function DeckRow({ deck }: { deck: Deck }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="qbr-deck-row">
      <span className="flex items-center gap-2">
        <TenantChip tenantId={deck.tenant.id} name={deck.tenant.name} slug={deck.tenant.slug} />
        <Link to={`/customer/qbr/decks/${encodeURIComponent(deck.id)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
          {deck.period ?? new Date(deck.periodStart).toLocaleDateString()}
        </Link>
        <Pill status={deck.status} />
      </span>
      <span className="text-xs text-[var(--color-text-muted)]">{deck.generatedAt ? `generated ${new Date(deck.generatedAt).toLocaleString()}` : deck.error ? deck.error : "not generated yet"}</span>
    </li>
  );
}

export function QbrListPage() {
  const overview = useQuery({
    queryKey: [...KEY, "overview"],
    queryFn: async () => {
      const data = (await consoleApi.get<Partial<{ decks: Deck[]; due: { period: string; tenants: TenantRef[] } }>>("/qbr")).data;
      return { decks: data.decks ?? [], due: data.due ?? { period: "", tenants: [] } };
    }
  });
  const data = overview.data;
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Quarterly business reviews</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Decks built from each tenant&apos;s real usage, deliveries, support, billing, health and AI use for a finished quarter.</p>
      </header>
      {overview.isError ? <ConsoleApiErrorPanel error={overview.error} onRetry={() => void overview.refetch()} title="Unable to load QBRs" /> : null}
      {data ? (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Due for {data.due.period || "the last quarter"} ({data.due.tenants.length})</h2>
            {data.due.tenants.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">Every active tenant has a deck for the last quarter.</p> : null}
            <ul className="flex flex-wrap gap-2">
              {data.due.tenants.slice(0, 50).map((tenant) => (
                <li key={tenant.id} data-testid="qbr-due" className="flex items-center gap-1">
                  <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />
                  <Link to={`/customer/qbr/tenants/${encodeURIComponent(tenant.id)}`} className="text-xs underline">
                    prepare
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Recent decks</h2>
            {data.decks.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No decks yet.</p> : null}
            <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
              {data.decks.map((deck) => (
                <DeckRow key={deck.id} deck={deck} />
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

export function QbrTenantPage() {
  const { tenantId = "" } = useParams();
  const queryClient = useQueryClient();
  const tenant = useQuery({ queryKey: [...KEY, "tenant", tenantId], queryFn: async () => (await consoleApi.get<{ tenant: TenantRef; decks: Deck[]; nextPeriod: string }>(`/qbr/tenants/${encodeURIComponent(tenantId)}`)).data, enabled: Boolean(tenantId), refetchInterval: (query) => (query.state.data?.decks.some((deck) => deck.status === "GENERATING") ? 3000 : false) });
  const generate = useMutation({
    mutationFn: async (period: string) => (await consoleApi.post<{ deckId: string; queued: boolean; status: string }>(`/qbr/tenants/${encodeURIComponent(tenantId)}/generate`, { period }, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
  const [period, setPeriod] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (tenant.data && !period) setPeriod(tenant.data.nextPeriod);
  }, [tenant.data, period]);
  const data = tenant.data;
  return (
    <div className="space-y-4">
      <header>
        <Link to="/customer/qbr" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
          QBRs
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">QBRs {data ? <TenantChip tenantId={data.tenant.id} name={data.tenant.name} slug={data.tenant.slug} /> : null}</h1>
      </header>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {tenant.isError ? <ConsoleApiErrorPanel error={tenant.error} onRetry={() => void tenant.refetch()} title="Unable to load this tenant's QBRs" /> : null}
      <section className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Quarter
          <input aria-label="Quarter" value={period} onChange={(event) => setPeriod(event.target.value.toUpperCase())} placeholder="2026-Q3" className="mt-1 w-32 rounded-md border border-[var(--color-border)] px-3 py-2 font-mono text-sm" />
        </label>
        <PermissionButton
          permission="customer.qbr.write"
          disabled={!/^\d{4}-Q[1-4]$/.test(period) || generate.isPending}
          onClick={() => {
            setError(null);
            generate
              .mutateAsync(period)
              .then((result) => setMessage(result.queued ? `Generating ${period}; the deck appears below when it is ready.` : `${period} is already being generated.`))
              .catch((err: unknown) => setError(apiErrorMessage(err, "The deck was not requested.")));
          }}
          className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Generate
        </PermissionButton>
        <p className="text-xs text-[var(--color-text-muted)]">Generating a quarter again refreshes its deck (until it is shared).</p>
      </section>
      {data && data.decks.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No decks for this tenant yet.</p> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
        {data?.decks.map((deck) => (
          <DeckRow key={deck.id} deck={deck} />
        ))}
      </ul>
    </div>
  );
}

export function QbrDeckPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const deck = useQuery({
    queryKey: [...KEY, "deck", id],
    queryFn: async () => (await consoleApi.get<Deck & { sections: Section[]; hasHtml: boolean }>(`/qbr/decks/${encodeURIComponent(id)}`)).data,
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === "GENERATING" ? 3000 : false)
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });
  const patch = useMutation({ mutationFn: async (body: { notes?: string | null; status?: "DRAFT" | "READY" }) => (await consoleApi.patch<Deck>(`/qbr/decks/${encodeURIComponent(id)}`, body)).data, onSuccess: invalidate });
  const share = useMutation({ mutationFn: async () => (await consoleApi.post<{ deck: Deck; notified: { inApp: number } }>(`/qbr/decks/${encodeURIComponent(id)}/share`, {}, { idempotent: true })).data, onSuccess: invalidate });
  const [notes, setNotes] = useState("");
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = deck.data;
  useEffect(() => setNotes(data?.notes ?? ""), [data?.notes]);
  const editable = data?.status === "DRAFT" || data?.status === "READY";

  async function attempt(work: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await work();
      setMessage(done);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The change was not saved."));
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {data ? (
            <span className="flex items-center gap-2 text-xs">
              <TenantChip tenantId={data.tenant.id} name={data.tenant.name} slug={data.tenant.slug} />
              <Link to={`/customer/qbr/tenants/${encodeURIComponent(data.tenant.id)}`} className="font-semibold text-[var(--color-text-muted)] hover:underline">
                all QBRs for this tenant
              </Link>
            </span>
          ) : null}
          <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">
            QBR {data?.period ?? ""} {data ? <Pill status={data.status} /> : null}
          </h1>
        </div>
        {data?.hasHtml ? (
          <a href={`/api/internal/qbr/decks/${encodeURIComponent(id)}/download`} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold">
            Download HTML
          </a>
        ) : null}
      </header>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {deck.isError ? <ConsoleApiErrorPanel error={deck.error} onRetry={() => void deck.refetch()} title="Unable to load the deck" /> : null}
      {data?.status === "GENERATING" ? <p className="text-sm text-[var(--color-text-muted)]">Generating from the tenant&apos;s data…</p> : null}
      {data?.status === "FAILED" ? <p className="text-sm text-red-700">Generation failed: {data.error}. Generate the quarter again from the tenant&apos;s QBR page.</p> : null}
      {data && editable ? (
        <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Notes for the tenant (shown at the top)
            <textarea aria-label="Deck notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            <PermissionButton permission="customer.qbr.write" disabled={notes === (data.notes ?? "")} onClick={() => void attempt(() => patch.mutateAsync({ notes: notes.trim() || null }), "Notes saved.")} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
              Save notes
            </PermissionButton>
            {data.status === "DRAFT" ? (
              <PermissionButton permission="customer.qbr.write" onClick={() => void attempt(() => patch.mutateAsync({ status: "READY" }), "Marked ready.")} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold">
                Mark ready
              </PermissionButton>
            ) : null}
            {data.status === "READY" ? (
              <PermissionButton permission="customer.qbr.write" onClick={() => setSharing(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white">
                Share with the tenant
              </PermissionButton>
            ) : null}
          </div>
        </section>
      ) : null}
      {data?.sharedAt ? <p className="text-xs text-[var(--color-text-muted)]">Shared {new Date(data.sharedAt).toLocaleString()}; the tenant&apos;s admins can open it under Reports.</p> : null}
      {data?.sections.map((section) => (
        <section key={section.key} className="rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="qbr-section">
          <h2 className="mb-1 text-sm font-semibold">{section.title}</h2>
          {section.empty ? <p className="text-xs italic text-[var(--color-text-muted)]">{section.emptyText}</p> : null}
          {section.items.length > 0 ? (
            <dl className="divide-y divide-[var(--color-border)] text-sm">
              {section.items.map((item) => (
                <div key={item.label} className="flex justify-between gap-4 py-1">
                  <dt className="text-[var(--color-text-muted)]">{item.label}</dt>
                  <dd className="text-right font-medium tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {section.notes.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {section.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <ActionDialog
        open={sharing}
        title="Share this QBR with the tenant"
        description="The tenant's admins are notified and can read it in the portal. A shared deck is not regenerated."
        confirmLabel="Share"
        onSubmit={async () => {
          const result = await share.mutateAsync();
          setMessage(`Shared; ${result.notified.inApp} admin(s) notified.`);
        }}
        onClose={() => setSharing(false)}
      />
    </div>
  );
}
