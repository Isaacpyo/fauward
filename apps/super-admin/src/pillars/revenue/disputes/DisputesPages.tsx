import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { consoleApi } from "@/lib/console-api";
import { apiErrorMessage } from "@/lib/console-api-error";

// revenue.disputes (WP-4.6): DisputesListPage (queue with an evidence-due countdown), DisputeDetailPage (payment,
// evidence submit to Stripe, notes, manual suspension through D3 — never automatic).

type VendorStatus = { vendor: string; configured: boolean; missing: string[] } | null;
type Dispute = {
  id: string;
  stripeDisputeId: string;
  stripeChargeId: string | null;
  tenant: { id: string; name: string; slug: string } | null;
  paymentId: string | null;
  paymentKind: string | null;
  amount: string;
  currency: string;
  reason: string;
  status: string;
  needsResponse: boolean;
  evidenceDueBy: string | null;
  hoursLeft: number | null;
  dueSoon: boolean;
  submittedAt: string | null;
  createdAt: string;
};
type DisputeDetail = Dispute & {
  evidence: Record<string, string> | null;
  payment: { id: string; amount: string; currency: string; status: string; invoiceId: string | null; gatewayRef: string | null; createdAt: string } | null;
  notes: Array<{ id: string; body: string; author: string; at: string }>;
  stripe: VendorStatus;
};

const KEY = ["revenue.disputes"] as const;
const EVIDENCE_FIELDS = [
  ["uncategorized_text", "What happened (summary for the bank)"],
  ["product_description", "Service provided"],
  ["service_date", "Service date"],
  ["customer_name", "Customer name"],
  ["customer_email_address", "Customer email"],
  ["billing_address", "Billing address"],
  ["access_activity_log", "Usage / access log"],
  ["refund_policy_disclosure", "Refund policy disclosure"],
  ["cancellation_policy_disclosure", "Cancellation policy disclosure"]
] as const;

function countdown(row: Pick<Dispute, "hoursLeft" | "needsResponse" | "evidenceDueBy">) {
  if (!row.needsResponse || row.hoursLeft === null) return row.evidenceDueBy ? new Date(row.evidenceDueBy).toLocaleDateString() : "—";
  if (row.hoursLeft < 0) return "Deadline passed";
  if (row.hoursLeft < 48) return `${row.hoursLeft} h left`;
  return `${Math.floor(row.hoursLeft / 24)} days left`;
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "won" ? "bg-green-100 text-green-800" : status === "lost" ? "bg-red-100 text-red-800" : status.includes("needs_response") ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>{status.replace(/_/g, " ")}</span>;
}

function StripeBanner({ stripe }: { stripe: VendorStatus | undefined }) {
  if (!stripe || stripe.configured) return null;
  return (
    <DegradedBanner variant="vendor-unconfigured" fixedBy="STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET">
      Disputes only originate at Stripe. Without Stripe configured no dispute arrives and evidence cannot be submitted from the console.
    </DegradedBanner>
  );
}

export function DisputesListPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "OPEN";
  const list = useInfiniteQuery({
    queryKey: [...KEY, "list", status],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => (await consoleApi.get<{ data: Dispute[]; nextCursor: string | null; stripe: VendorStatus }>("/disputes", { params: { status, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor
  });
  const rows = list.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Disputes &amp; chargebacks</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Stripe disputes on charges made through Fauward&apos;s Stripe account, soonest evidence deadline first. Suspending a tenant over a dispute is a separate staff decision.</p>
      </header>
      <StripeBanner stripe={list.data?.pages[0]?.stripe} />
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Show
        <select aria-label="Dispute status" value={status} onChange={(event) => setParams({ status: event.target.value }, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="ALL">All</option>
        </select>
      </label>
      {list.isError ? <ConsoleApiErrorPanel error={list.error} onRetry={() => void list.refetch()} title="Unable to load disputes" /> : null}
      {list.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading disputes…</p> : null}
      {list.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">{status === "OPEN" ? "No open disputes." : "No disputes."}</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Dispute</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Evidence due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="dispute-row">
                  <td className="px-3 py-2">
                    <Link to={`/revenue/disputes/${encodeURIComponent(row.id)}`} className="font-mono text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
                      {row.stripeDisputeId}
                    </Link>
                    <p className="text-xs text-[var(--color-text-muted)]">{row.reason.replace(/_/g, " ")}</p>
                  </td>
                  <td className="px-3 py-2">{row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : <span className="text-xs text-[var(--color-text-muted)]">Unmatched charge</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.amount} {row.currency}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={row.status} />
                  </td>
                  <td className={`px-3 py-2 text-xs ${row.dueSoon ? "font-semibold text-red-700" : ""}`}>{countdown(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {list.hasNextPage ? (
        <button type="button" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage} className="text-xs underline">
          Load more
        </button>
      ) : null}
    </div>
  );
}

export function DisputeDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: [...KEY, "detail", id], queryFn: async () => (await consoleApi.get<DisputeDetail>(`/disputes/${encodeURIComponent(id)}`)).data, enabled: Boolean(id) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });
  const submit = useMutation({ mutationFn: async (body: { reason: string; evidence: Record<string, string> }) => (await consoleApi.post<{ status: string }>(`/disputes/${encodeURIComponent(id)}/evidence`, body, { idempotent: true })).data, onSuccess: invalidate });
  const note = useMutation({ mutationFn: async (body: string) => (await consoleApi.post(`/disputes/${encodeURIComponent(id)}/notes`, { body }, { idempotent: true })).data, onSuccess: invalidate });
  const suspend = useMutation({
    mutationFn: async ({ tenantId, reason }: { tenantId: string; reason: string }) => (await consoleApi.post(`/tenants/${encodeURIComponent(tenantId)}/suspend`, { category: "BILLING", reason }, { idempotent: true })).data,
    onSuccess: invalidate
  });
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<"evidence" | "suspend" | null>(null);
  const [noteText, setNoteText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const row = detail.data;
  const filled = Object.fromEntries(Object.entries(evidence).filter(([, value]) => value.trim()));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/revenue/disputes" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            Disputes
          </Link>
          <h1 className="font-mono text-xl font-bold text-[var(--color-text-primary)]">{row?.stripeDisputeId ?? "Dispute"}</h1>
          {row ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <StatusPill status={row.status} />
              <span>
                {row.amount} {row.currency} · {row.reason.replace(/_/g, " ")}
              </span>
              {row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : <span>Unmatched charge {row.stripeChargeId}</span>}
              <span className={row.dueSoon ? "font-semibold text-red-700" : ""}>Evidence: {countdown(row)}</span>
            </p>
          ) : null}
        </div>
        {row?.tenant ? (
          <PermissionButton permission="platform.tenants.suspend" onClick={() => setDialog("suspend")} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
            Suspend tenant…
          </PermissionButton>
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
      <StripeBanner stripe={row?.stripe} />
      {detail.isError ? <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the dispute" /> : null}
      {row ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold">Evidence</h2>
            {row.submittedAt ? <p className="text-xs text-[var(--color-text-muted)]">Submitted to Stripe {new Date(row.submittedAt).toLocaleString()}.</p> : null}
            {row.needsResponse ? (
              <>
                {EVIDENCE_FIELDS.map(([field, text]) => (
                  <label key={field} className="block text-xs font-semibold text-[var(--color-text-muted)]">
                    {text}
                    <textarea value={evidence[field] ?? ""} onChange={(event) => setEvidence((current) => ({ ...current, [field]: event.target.value }))} rows={field === "uncategorized_text" ? 4 : 1} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
                  </label>
                ))}
                <PermissionButton permission="revenue.disputes.write" disabled={Object.keys(filled).length === 0 || row.stripe?.configured === false} onClick={() => setDialog("evidence")} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  Submit evidence to Stripe
                </PermissionButton>
              </>
            ) : (
              <dl className="space-y-1 text-sm">
                {row.evidence && Object.keys(row.evidence).length > 0 ? (
                  Object.entries(row.evidence).map(([field, value]) => (
                    <div key={field}>
                      <dt className="text-xs font-semibold text-[var(--color-text-muted)]">{field.replace(/_/g, " ")}</dt>
                      <dd className="whitespace-pre-wrap">{value}</dd>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">Stripe no longer takes evidence for this dispute; none was submitted from the console.</p>
                )}
              </dl>
            )}
          </section>
          <div className="space-y-4">
            <section className="space-y-1 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm" data-testid="dispute-payment">
              <h2 className="text-sm font-semibold">Disputed payment</h2>
              {row.payment ? (
                <>
                  <p>
                    {row.payment.amount} {row.payment.currency} · {row.payment.status.toLowerCase()} · {row.paymentKind === "PLATFORM" ? "Fauward billing" : "tenant's customer"}
                  </p>
                  {row.payment.invoiceId && row.paymentKind === "PLATFORM" ? (
                    <Link to={`/revenue/billing/invoices/${encodeURIComponent(row.payment.invoiceId)}`} className="text-xs underline">
                      Open the invoice
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">No Fauward payment matches charge {row.stripeChargeId ?? "—"}.</p>
              )}
            </section>
            <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
              <h2 className="text-sm font-semibold">Notes</h2>
              <textarea aria-label="New note" value={noteText} onChange={(event) => setNoteText(event.target.value)} rows={2} className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
              <PermissionButton
                permission="revenue.disputes.write"
                disabled={!noteText.trim() || note.isPending}
                onClick={() => {
                  setError(null);
                  note
                    .mutateAsync(noteText.trim())
                    .then(() => {
                      setNoteText("");
                      setMessage("Note added.");
                    })
                    .catch((err: unknown) => setError(apiErrorMessage(err, "The note was not saved.")));
                }}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50"
              >
                Add note
              </PermissionButton>
              <ul className="space-y-2 text-sm">
                {row.notes.map((item) => (
                  <li key={item.id} data-testid="dispute-note">
                    <p className="whitespace-pre-wrap">{item.body}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {item.author} · {new Date(item.at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}
      <ActionDialog
        open={dialog === "evidence"}
        dangerous
        title="Submit evidence to Stripe"
        description="Stripe takes one submission per dispute; it goes to the bank as is."
        confirmLabel="Submit"
        onSubmit={async (reason) => {
          const result = await submit.mutateAsync({ reason, evidence: filled });
          setMessage(`Evidence submitted; the dispute is ${result.status.replace(/_/g, " ")}.`);
        }}
        onClose={() => setDialog(null)}
      />
      <ActionDialog
        open={dialog === "suspend"}
        dangerous
        title={`Suspend ${row?.tenant?.name ?? "the tenant"}`}
        description="A BILLING suspension through the one suspension path; the tenant sees the suspension overlay. Lifting it is on the tenant page."
        confirmLabel="Suspend"
        onSubmit={async (reason) => {
          if (!row?.tenant) return;
          await suspend.mutateAsync({ tenantId: row.tenant.id, reason: `Dispute ${row.stripeDisputeId}: ${reason}` });
          setMessage(`${row.tenant.name} is suspended (BILLING).`);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
