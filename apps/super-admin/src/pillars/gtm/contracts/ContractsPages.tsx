import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@fauward/internal-rbac";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { MoneyCell } from "@/components/service-kit/MoneyCell";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker } from "@/components/service-kit/TenantPicker";
import { consoleApi } from "@/lib/console-api";
import { apiErrorMessage } from "@/lib/console-api-error";
import { consoleApiUrl } from "@/lib/console-api-origin";

// gtm.contracts (WP-4.19): QuotesPage, QuoteEditorPage, ApprovalsPage, MsasPage, DiscountsPage. A quote is priced from
// the plan list price less its discount; submitting routes it to a large-discount approver when it is above the limit
// (or the term is over 24 months); an approved quote is sent (DocuSign or PDF) and accepted with the signed PDF, which
// writes the MSA, activates the contract and its pricing override, and moves the tenant to the quoted plan.

type QuoteStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SENT" | "ACCEPTED";
type Vendor = { configured: boolean; missing?: string[] };
type Approval = { id: string; status: "PENDING" | "APPROVED" | "REJECTED"; reasons: string[]; requestedBy: string | null; approverId: string | null; conditions: string | null; decidedAt: string | null; createdAt: string };
type Quote = {
  id: string;
  quoteNumber: string;
  tenant: { id: string; name: string; slug: string | null; plan: string | null; kycStatus: string | null } | null;
  plan: "STARTER" | "PRO" | "ENTERPRISE";
  billingCycle: "MONTHLY" | "ANNUAL";
  termMonths: number;
  discountPercent: string;
  listMonthly: string | null;
  netMonthly: string | null;
  currency: string | null;
  startDate: string | null;
  customFeatures: string[];
  notes: string | null;
  signerName: string | null;
  signerEmail: string | null;
  status: QuoteStatus;
  contractId: string | null;
  docusignEnvelopeId: string | null;
  needsApproval: string[];
  pdfUrl: string;
  submittedAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};
type QuoteDetail = Quote & { approvals: Approval[]; msa: Msa | null; approvalThresholdPercent: number; docusign: Vendor };
type Msa = { id: string; tenantId: string; quoteId: string | null; contractId: string | null; signedVia: string | null; signatureDate: string | null; expiryDate: string | null; governingLaw: string | null; fileName: string | null; documentUrl: string | null };
type MsaRow = Msa & { tenant: { id: string; name: string; slug: string | null }; daysToRenewal: number | null };

const KEY = ["gtm.contracts"] as const;
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const input = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-normal text-[var(--color-text-primary)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const secondary = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

const STATUS_TEXT: Record<QuoteStatus, string> = { DRAFT: "Draft", PENDING_APPROVAL: "Waiting for approval", APPROVED: "Approved", REJECTED: "Rejected", SENT: "Sent", ACCEPTED: "Accepted" };

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function ContractsNav({ active }: { active: "quotes" | "approvals" | "msas" | "discounts" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Contracts sections">
      {item("quotes", "/gtm/contracts/quotes", "Quotes")}
      {item("approvals", "/gtm/contracts/approvals", "Approvals")}
      {item("msas", "/gtm/contracts/msas", "MSAs")}
      {item("discounts", "/gtm/contracts/discounts", "Discounts")}
    </nav>
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

function QuoteRow({ quote }: { quote: Quote }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="quote-row">
      <span className="flex flex-wrap items-center gap-2">
        <Link to={`/gtm/contracts/quotes/${encodeURIComponent(quote.id)}`} className="font-mono text-xs font-semibold underline">
          {quote.quoteNumber}
        </Link>
        {quote.tenant ? <TenantChip tenantId={quote.tenant.id} name={quote.tenant.name} slug={quote.tenant.slug} /> : <span className="text-xs text-[var(--color-text-muted)]">No tenant</span>}
        <span className="text-xs">
          {quote.plan} · {quote.termMonths} months · {quote.discountPercent}% off
        </span>
      </span>
      <span className="flex items-center gap-3 text-xs">
        <MoneyCell amount={quote.netMonthly} currency={quote.currency} />
        <span className="text-[var(--color-text-muted)]">/ month · {STATUS_TEXT[quote.status]}</span>
      </span>
    </li>
  );
}

export function QuotesPage() {
  const canWrite = usePermission("gtm.contracts.write") === true;
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const quotes = useQuery({
    queryKey: [...KEY, "quotes", status],
    queryFn: async () => {
      const body = (await consoleApi.get<{ data?: Quote[]; approvalThresholdPercent?: number; docusign?: Vendor }>("/contracts/quotes", { params: status ? { status } : {} })).data;
      return { rows: body.data ?? [], threshold: body.approvalThresholdPercent ?? null, docusign: body.docusign ?? null };
    }
  });
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Quotes</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {quotes.data?.threshold !== null && quotes.data?.threshold !== undefined ? `Discounts above ${quotes.data.threshold}% or terms over 24 months need a large-discount approver.` : "Quotes and their approval, signature and acceptance."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ContractsNav active="quotes" />
          {canWrite ? (
            <Link to="/gtm/contracts/quotes/new" className={primary}>
              New quote
            </Link>
          ) : (
            <PermissionButton permission="gtm.contracts.write" className={primary}>
              New quote
            </PermissionButton>
          )}
        </div>
      </header>
      {quotes.data?.docusign && !quotes.data.docusign.configured ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy={(quotes.data.docusign.missing ?? []).join(", ") || "DOCUSIGN_ACCESS_TOKEN"}>
          DocuSign is not connected: approved quotes are sent as a PDF and accepted by uploading the signed copy.
        </DegradedBanner>
      ) : null}
      <label className={label}>
        Status
        <select aria-label="Quote status" value={status} onChange={(event) => setParams(event.target.value ? { status: event.target.value } : {}, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="">All</option>
          {(Object.keys(STATUS_TEXT) as QuoteStatus[]).map((key) => (
            <option key={key} value={key}>
              {STATUS_TEXT[key]}
            </option>
          ))}
        </select>
      </label>
      {quotes.isError ? <ConsoleApiErrorPanel error={quotes.error} onRetry={() => void quotes.refetch()} title="Unable to load quotes" /> : null}
      {quotes.data && quotes.data.rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No quote yet.</p> : null}
      {quotes.data && quotes.data.rows.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {quotes.data.rows.map((quote) => (
            <QuoteRow key={quote.id} quote={quote} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type Draft = {
  tenant: { id: string; name: string; slug: string | null } | null;
  plan: Quote["plan"];
  billingCycle: Quote["billingCycle"];
  termMonths: string;
  discountPercent: string;
  listMonthly: string;
  currency: string;
  startDate: string;
  customFeatures: string;
  notes: string;
  signerName: string;
  signerEmail: string;
};

const EMPTY: Draft = { tenant: null, plan: "PRO", billingCycle: "MONTHLY", termMonths: "12", discountPercent: "0", listMonthly: "", currency: "GBP", startDate: "", customFeatures: "", notes: "", signerName: "", signerEmail: "" };

function draftFrom(quote: Quote): Draft {
  return {
    tenant: quote.tenant ? { id: quote.tenant.id, name: quote.tenant.name, slug: quote.tenant.slug } : null,
    plan: quote.plan,
    billingCycle: quote.billingCycle,
    termMonths: String(quote.termMonths),
    discountPercent: String(Number(quote.discountPercent)),
    listMonthly: quote.plan === "ENTERPRISE" ? quote.listMonthly ?? "" : "",
    currency: quote.currency ?? "GBP",
    startDate: quote.startDate ?? "",
    customFeatures: quote.customFeatures.join("\n"),
    notes: quote.notes ?? "",
    signerName: quote.signerName ?? "",
    signerEmail: quote.signerEmail ?? ""
  };
}

function bodyFor(draft: Draft) {
  return {
    tenantId: draft.tenant?.id ?? null,
    plan: draft.plan,
    billingCycle: draft.billingCycle,
    termMonths: Number(draft.termMonths),
    discountPercent: Number(draft.discountPercent || "0"),
    ...(draft.plan === "ENTERPRISE" ? { listMonthly: draft.listMonthly.trim(), currency: draft.currency.trim().toUpperCase() } : {}),
    startDate: draft.startDate || null,
    customFeatures: draft.customFeatures.split("\n").map((line) => line.trim()).filter(Boolean),
    notes: draft.notes.trim() || null,
    signerName: draft.signerName.trim() || null,
    signerEmail: draft.signerEmail.trim() || null
  };
}

function QuoteForm({ draft, onChange, readOnly }: { draft: Draft; onChange: (draft: Draft) => void; readOnly: boolean }) {
  const [picking, setPicking] = useState(false);
  const update = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className={label}>Tenant</p>
        <p className="mt-1 flex items-center gap-2 text-sm">
          {draft.tenant ? <TenantChip tenantId={draft.tenant.id} name={draft.tenant.name} slug={draft.tenant.slug} /> : "None (needed before submitting)"}
          {!readOnly ? (
            <button type="button" className={secondary} onClick={() => setPicking((value) => !value)}>
              {draft.tenant ? "Change" : "Choose a tenant"}
            </button>
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
      <label className={label}>
        Plan
        <select aria-label="Plan" value={draft.plan} disabled={readOnly} onChange={(event) => update({ plan: event.target.value as Draft["plan"] })} className={input}>
          <option value="STARTER">Starter</option>
          <option value="PRO">Pro</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>
      </label>
      <label className={label}>
        Billing
        <select aria-label="Billing" value={draft.billingCycle} disabled={readOnly} onChange={(event) => update({ billingCycle: event.target.value as Draft["billingCycle"] })} className={input}>
          <option value="MONTHLY">Monthly</option>
          <option value="ANNUAL">Annual</option>
        </select>
      </label>
      <label className={label}>
        Term (months)
        <input aria-label="Term (months)" type="number" min={1} max={60} value={draft.termMonths} readOnly={readOnly} onChange={(event) => update({ termMonths: event.target.value })} className={input} />
      </label>
      <label className={label}>
        Discount %
        <input aria-label="Discount %" type="number" min={0} max={100} step="0.01" value={draft.discountPercent} readOnly={readOnly} onChange={(event) => update({ discountPercent: event.target.value })} className={input} />
      </label>
      {draft.plan === "ENTERPRISE" ? (
        <>
          <label className={label}>
            List price per month
            <input aria-label="List price per month" inputMode="decimal" value={draft.listMonthly} readOnly={readOnly} onChange={(event) => update({ listMonthly: event.target.value })} className={input} />
          </label>
          <label className={label}>
            Currency
            <input aria-label="Currency" maxLength={3} value={draft.currency} readOnly={readOnly} onChange={(event) => update({ currency: event.target.value })} className={input} />
          </label>
        </>
      ) : null}
      <label className={label}>
        Start date (blank = on acceptance)
        <input aria-label="Start date" type="date" value={draft.startDate} readOnly={readOnly} onChange={(event) => update({ startDate: event.target.value })} className={input} />
      </label>
      <label className={label}>
        Signer name
        <input aria-label="Signer name" value={draft.signerName} readOnly={readOnly} onChange={(event) => update({ signerName: event.target.value })} className={input} />
      </label>
      <label className={label}>
        Signer email
        <input aria-label="Signer email" type="email" value={draft.signerEmail} readOnly={readOnly} onChange={(event) => update({ signerEmail: event.target.value })} className={input} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Custom features (one per line)
        <textarea aria-label="Custom features" rows={2} value={draft.customFeatures} readOnly={readOnly} onChange={(event) => update({ customFeatures: event.target.value })} className={input} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Notes
        <textarea aria-label="Notes" rows={2} value={draft.notes} readOnly={readOnly} onChange={(event) => update({ notes: event.target.value })} className={input} />
      </label>
    </div>
  );
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"));
    reader.readAsDataURL(file);
  });
}

export function QuoteEditorPage() {
  const { id = "" } = useParams();
  const isNew = id === "" || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canWrite = usePermission("gtm.contracts.write") === true;
  const detail = useQuery({ queryKey: [...KEY, "quote", id], enabled: !isNew, queryFn: async () => (await consoleApi.get<QuoteDetail>(`/contracts/quotes/${encodeURIComponent(id)}`)).data });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const data = detail.data;
  useEffect(() => {
    if (data) setDraft(draftFrom(data));
  }, [data]);

  const refresh = (quote: QuoteDetail) => {
    queryClient.setQueryData([...KEY, "quote", quote.id], quote);
    void queryClient.invalidateQueries({ queryKey: [...KEY, "quotes"] });
    void queryClient.invalidateQueries({ queryKey: [...KEY, "approvals"] });
    void queryClient.invalidateQueries({ queryKey: [...KEY, "discounts"] });
    void queryClient.invalidateQueries({ queryKey: [...KEY, "msas"] });
  };
  const save = useMutation({
    mutationFn: async () => (isNew ? (await consoleApi.post<QuoteDetail>("/contracts/quotes", bodyFor(draft))).data : (await consoleApi.patch<QuoteDetail>(`/contracts/quotes/${encodeURIComponent(id)}`, bodyFor(draft))).data),
    onSuccess: refresh
  });
  const action = useMutation({
    mutationFn: async (kind: "submit" | "send") => {
      if (kind === "submit") return { quote: (await consoleApi.post<QuoteDetail>(`/contracts/quotes/${encodeURIComponent(id)}/submit`, {})).data, delivery: null };
      const sent = (await consoleApi.post<{ quote: QuoteDetail; delivery: "DOCUSIGN" | "MANUAL" }>(`/contracts/quotes/${encodeURIComponent(id)}/send`, {})).data;
      return { quote: sent.quote, delivery: sent.delivery };
    },
    onSuccess: (result) => refresh(result.quote)
  });

  async function run(task: () => Promise<string>) {
    setError(null);
    setMessage(null);
    try {
      setMessage(await task());
    } catch (caught) {
      setError(apiErrorMessage(caught, "The quote could not be updated."));
    }
  }

  const editable = isNew || data?.status === "DRAFT" || data?.status === "REJECTED";
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{isNew ? "New quote" : data ? `Quote ${data.quoteNumber}` : "Quote"}</h1>
          {data ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]" data-testid="quote-summary">
              {STATUS_TEXT[data.status]} · list <MoneyCell amount={data.listMonthly} currency={data.currency} /> · {data.discountPercent}% off · <MoneyCell amount={data.netMonthly} currency={data.currency} /> / month
            </p>
          ) : null}
        </div>
        <ContractsNav active="quotes" />
      </header>
      <Alerts message={message} error={error} />
      {detail.isError ? <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load this quote" /> : null}
      {data && data.needsApproval.length > 0 && data.status === "DRAFT" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="needs-approval">
          Submitting needs a large-discount approver: {data.needsApproval.join("; ")}.
        </p>
      ) : null}
      {isNew || data ? (
        <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Quote">
          <QuoteForm draft={draft} onChange={setDraft} readOnly={!editable || !canWrite} />
          {editable ? (
            <PermissionButton
              permission="gtm.contracts.write"
              disabled={save.isPending}
              className={primary}
              onClick={() =>
                void run(async () => {
                  const quote = await save.mutateAsync();
                  if (isNew) navigate(`/gtm/contracts/quotes/${encodeURIComponent(quote.id)}`, { replace: true });
                  return isNew ? `Quote ${quote.quoteNumber} created.` : "Quote saved.";
                })
              }
            >
              {isNew ? "Create quote" : "Save quote"}
            </PermissionButton>
          ) : null}
        </section>
      ) : null}
      {data ? (
        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Actions">
          {data.status === "DRAFT" ? (
            <PermissionButton permission="gtm.contracts.write" disabled={action.isPending} className={primary} onClick={() => void run(async () => ((await action.mutateAsync("submit")).quote.status === "APPROVED" ? "Approved: within the discount limit." : "Sent for approval."))}>
              Submit
            </PermissionButton>
          ) : null}
          {data.status === "APPROVED" ? (
            <PermissionButton permission="gtm.contracts.write" disabled={action.isPending} className={primary} onClick={() => void run(async () => ((await action.mutateAsync("send")).delivery === "DOCUSIGN" ? "Sent through DocuSign." : "Marked as sent: download the PDF and send it to the signer."))}>
              Send
            </PermissionButton>
          ) : null}
          {data.status === "APPROVED" || data.status === "SENT" ? (
            <PermissionButton permission="gtm.contracts.write" className={secondary} onClick={() => setAccepting(true)}>
              Upload signed PDF
            </PermissionButton>
          ) : null}
          <a href={consoleApiUrl(data.pdfUrl)} className={secondary} target="_blank" rel="noreferrer">
            Download quote PDF
          </a>
          {!data.docusign.configured && data.status === "APPROVED" ? <span className="text-xs text-[var(--color-text-muted)]">DocuSign is not connected: Send marks the quote as sent.</span> : null}
        </section>
      ) : null}
      {data && data.approvals.length > 0 ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm" aria-label="Approvals">
          <h2 className="font-semibold">Approvals</h2>
          <ul className="mt-2 space-y-1">
            {data.approvals.map((approval) => (
              <li key={approval.id}>
                {approval.status.toLowerCase()} · {approval.reasons.join("; ")}
                {approval.conditions ? ` · conditions: ${approval.conditions}` : ""}
                {approval.decidedAt ? ` · ${day(approval.decidedAt)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data?.msa ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm" aria-label="Agreement">
          <h2 className="font-semibold">Agreement</h2>
          <p className="mt-1">
            Signed {day(data.msa.signatureDate)} via {data.msa.signedVia === "DOCUSIGN" ? "DocuSign" : "upload"} · renews {day(data.msa.expiryDate)}
            {data.msa.documentUrl ? (
              <>
                {" · "}
                <a href={consoleApiUrl(data.msa.documentUrl)} className="underline" target="_blank" rel="noreferrer">
                  Signed PDF
                </a>
              </>
            ) : null}
          </p>
        </section>
      ) : null}
      <ActionDialog
        open={accepting}
        dangerous
        title={data ? `Accept quote ${data.quoteNumber}` : "Accept quote"}
        description="Stores the signed PDF as the MSA, activates the contract at the quoted price with its discount, and moves the tenant to the quoted plan."
        confirmLabel="Accept"
        validate={() => (file ? null : "Choose the signed PDF.")}
        onSubmit={async (reason) => {
          if (!file) return;
          const dataBase64 = await toBase64(file);
          const result = (await consoleApi.post<{ quote: QuoteDetail }>(`/contracts/quotes/${encodeURIComponent(id)}/accept`, { fileName: file.name, contentType: "application/pdf", dataBase64, reason })).data;
          refresh(result.quote);
          setMessage("Quote accepted: contract active.");
        }}
        onClose={() => {
          setAccepting(false);
          setFile(null);
        }}
      >
        <label className={label}>
          Signed PDF
          <input aria-label="Signed PDF" type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block text-sm" />
        </label>
      </ActionDialog>
    </div>
  );
}

type ApprovalRow = Approval & { quote: Quote | null };

export function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "PENDING";
  const approvals = useQuery({ queryKey: [...KEY, "approvals", status], queryFn: async () => (await consoleApi.get<{ data?: ApprovalRow[] }>("/contracts/approvals", { params: { status } })).data.data ?? [] });
  const [pending, setPending] = useState<{ row: ApprovalRow; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [conditions, setConditions] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Discount approvals</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Quotes above the discount limit or over 24 months. The quote author cannot decide their own.</p>
        </div>
        <ContractsNav active="approvals" />
      </header>
      <Alerts message={message} error={null} />
      <label className={label}>
        Status
        <select aria-label="Approval status" value={status} onChange={(event) => setParams({ status: event.target.value }, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="PENDING">Waiting</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="ALL">All</option>
        </select>
      </label>
      {approvals.isError ? <ConsoleApiErrorPanel error={approvals.error} onRetry={() => void approvals.refetch()} title="Unable to load approvals" /> : null}
      {approvals.data && approvals.data.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">{status === "PENDING" ? "Nothing is waiting for approval." : "None."}</p> : null}
      {approvals.data && approvals.data.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {approvals.data.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="approval-row">
              <span className="flex flex-wrap items-center gap-2">
                {row.quote ? (
                  <Link to={`/gtm/contracts/quotes/${encodeURIComponent(row.quote.id)}`} className="font-mono text-xs font-semibold underline">
                    {row.quote.quoteNumber}
                  </Link>
                ) : null}
                {row.quote?.tenant ? <TenantChip tenantId={row.quote.tenant.id} name={row.quote.tenant.name} slug={row.quote.tenant.slug} /> : null}
                <span className="text-xs">
                  {row.quote ? `${row.quote.plan} · ${row.quote.discountPercent}% off · ${row.quote.termMonths} months · ` : ""}
                  {row.reasons.join("; ")}
                  {row.status !== "PENDING" ? ` · ${row.status.toLowerCase()}` : ""}
                </span>
              </span>
              {row.status === "PENDING" ? (
                <span className="flex gap-2">
                  <PermissionButton permission="gtm.contracts.discount.large" className={primary} onClick={() => setPending({ row, decision: "APPROVED" })}>
                    Approve
                  </PermissionButton>
                  <PermissionButton permission="gtm.contracts.discount.large" className={secondary} onClick={() => setPending({ row, decision: "REJECTED" })}>
                    Reject
                  </PermissionButton>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <ActionDialog
        open={pending !== null}
        dangerous
        title={pending ? `${pending.decision === "APPROVED" ? "Approve" : "Reject"} ${pending.row.quote?.quoteNumber ?? "quote"}` : ""}
        description={pending?.decision === "APPROVED" ? "The quote can then be sent to the customer." : "The author can edit the quote and submit it again."}
        confirmLabel={pending?.decision === "APPROVED" ? "Approve" : "Reject"}
        onSubmit={async (reason) => {
          if (!pending) return;
          await consoleApi.post(`/contracts/approvals/${encodeURIComponent(pending.row.id)}/decision`, { decision: pending.decision, reason, ...(conditions.trim() ? { conditions: conditions.trim() } : {}) });
          await queryClient.invalidateQueries({ queryKey: KEY });
          setMessage(`${pending.row.quote?.quoteNumber ?? "Quote"} ${pending.decision === "APPROVED" ? "approved" : "rejected"}.`);
        }}
        onClose={() => {
          setPending(null);
          setConditions("");
        }}
      >
        <label className={label}>
          Conditions (optional)
          <input aria-label="Conditions" value={conditions} onChange={(event) => setConditions(event.target.value)} className={input} />
        </label>
      </ActionDialog>
    </div>
  );
}

export function MsasPage() {
  const msas = useQuery({ queryKey: [...KEY, "msas"], queryFn: async () => (await consoleApi.get<{ data?: MsaRow[] }>("/contracts/msas")).data.data ?? [] });
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Master service agreements</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Signed agreements, soonest renewal first.</p>
        </div>
        <ContractsNav active="msas" />
      </header>
      {msas.isError ? <ConsoleApiErrorPanel error={msas.error} onRetry={() => void msas.refetch()} title="Unable to load agreements" /> : null}
      {msas.data && msas.data.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No signed agreement yet.</p> : null}
      {msas.data && msas.data.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {msas.data.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="msa-row">
              <span className="flex flex-wrap items-center gap-2">
                <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                <span className="text-xs">
                  signed {day(row.signatureDate)} via {row.signedVia === "DOCUSIGN" ? "DocuSign" : "upload"}
                  {row.governingLaw ? ` · ${row.governingLaw}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-3 text-xs">
                <span className={row.daysToRenewal !== null && row.daysToRenewal <= 60 ? "font-semibold text-amber-800" : "text-[var(--color-text-muted)]"}>
                  {row.daysToRenewal === null ? "No end date" : row.daysToRenewal < 0 ? `Ended ${day(row.expiryDate)}` : `Renews ${day(row.expiryDate)} (${row.daysToRenewal} days)`}
                </span>
                {row.documentUrl ? (
                  <a href={consoleApiUrl(row.documentUrl)} className="underline" target="_blank" rel="noreferrer">
                    PDF
                  </a>
                ) : null}
                {row.quoteId ? (
                  <Link to={`/gtm/contracts/quotes/${encodeURIComponent(row.quoteId)}`} className="underline">
                    Quote
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type DiscountGroup = { status: QuoteStatus; count: number; averageDiscountPercent: string | null; quotes: Quote[] };

export function DiscountsPage() {
  const discounts = useQuery({
    queryKey: [...KEY, "discounts"],
    queryFn: async () => {
      const body = (await consoleApi.get<{ groups?: DiscountGroup[]; approvalThresholdPercent?: number }>("/contracts/discounts")).data;
      return { groups: body.groups ?? [], threshold: body.approvalThresholdPercent ?? null };
    }
  });
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Discounts</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Discounted quotes grouped by where they are{discounts.data?.threshold !== null && discounts.data?.threshold !== undefined ? `; approval needed above ${discounts.data.threshold}%` : ""}.</p>
        </div>
        <ContractsNav active="discounts" />
      </header>
      {discounts.isError ? <ConsoleApiErrorPanel error={discounts.error} onRetry={() => void discounts.refetch()} title="Unable to load discounts" /> : null}
      {discounts.data && discounts.data.groups.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No discounted quote.</p> : null}
      {discounts.data?.groups.map((group) => (
        <section key={group.status} className="rounded-lg border border-[var(--color-border)] bg-white" aria-label={STATUS_TEXT[group.status]} data-testid={`discount-group-${group.status}`}>
          <h2 className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-semibold">
            {STATUS_TEXT[group.status]} · {group.count} · average {group.averageDiscountPercent ?? "—"}%
          </h2>
          <ul className="divide-y divide-[var(--color-border)]">
            {group.quotes.map((quote) => (
              <QuoteRow key={quote.id} quote={quote} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
