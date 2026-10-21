import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { consoleApi } from "@/lib/console-api";

// trust.kyc (WP-4.10): KycQueuePage (reviews), KycReviewPage (evidence, decision), ScreeningsPage (sanctions/PEP,
// CLEAR/MATCH). Manual by default; Persona and ComplyAdvantage are optional.

type VendorStatus = { vendor: string; configured: boolean; missing: string[] } | null;
type TenantRef = { id: string; name: string; slug: string | null; kycStatus?: string | null };
type Evidence = { id: string; source: "STAFF" | "TENANT"; fileName: string; contentType: string; byteSize: number; note: string | null; by: string; at: string };
type Review = { id: string; tenant: TenantRef; provider: string; inquiryId: string | null; status: string; requestNote: string | null; evidence: Evidence[]; decisionReason: string | null; decidedAt: string | null; reviewedBy: string | null; createdAt: string };
type Screening = { id: string; tenant: TenantRef; provider: string; source: string | null; status: string; matchType: string | null; riskLevel: string | null; decisionReason: string | null; decidedAt: string | null; createdAt: string };

const KEY = ["trust.kyc"] as const;
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const secondary = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold";
const inputClass = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";

function KycNav({ active }: { active: "reviews" | "screenings" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  return (
    <nav className="flex gap-2" aria-label="KYC sections">
      <Link to="/trust/kyc" className={`${base} ${active === "reviews" ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
        Reviews
      </Link>
      <Link to="/trust/kyc/sanctions" className={`${base} ${active === "screenings" ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
        Sanctions &amp; PEP
      </Link>
    </nav>
  );
}

function Notice({ message }: { message: string | null }) {
  return message ? (
    <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
      {message}
    </p>
  ) : null;
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"));
    reader.readAsDataURL(file);
  });
}

export function KycQueuePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "OPEN";
  const reviews = useQuery({ queryKey: [...KEY, "reviews", status], queryFn: async () => (await consoleApi.get<{ data: Review[]; persona: VendorStatus }>("/kyc/reviews", { params: { status } })).data });
  const open = useMutation({
    mutationFn: async (body: { tenantId: string; provider: string; note?: string }) => (await consoleApi.post<Review>("/kyc/reviews", body, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
  const [opening, setOpening] = useState(false);
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [provider, setProvider] = useState("manual");
  const [note, setNote] = useState("");
  const rows = reviews.data?.data ?? [];
  const personaReady = reviews.data?.persona === null;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">KYC reviews</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Business verification. Enterprise plans need an approved review.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <KycNav active="reviews" />
          <PermissionButton permission="trust.kyc.approve" onClick={() => setOpening(true)} className={primary}>
            Open review
          </PermissionButton>
        </div>
      </header>
      {reviews.data?.persona && !reviews.data.persona.configured ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy={reviews.data.persona.missing.join(", ")}>
          Persona is not configured: reviews are manual — staff collect documents and decide.
        </DegradedBanner>
      ) : null}
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Status
        <select aria-label="Review status" value={status} onChange={(event) => setParams({ status: event.target.value }, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="OPEN">Open</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="ALL">All</option>
        </select>
      </label>
      {reviews.isError ? <ConsoleApiErrorPanel error={reviews.error} onRetry={() => void reviews.refetch()} title="Unable to load reviews" /> : null}
      {reviews.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">{status === "OPEN" ? "No open reviews." : "None."}</p> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="kyc-review-row">
            <span className="flex items-center gap-2">
              <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
              <Link to={`/trust/kyc/${encodeURIComponent(row.id)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
                {row.status.toLowerCase()} review
              </Link>
              <span className="text-xs text-[var(--color-text-muted)]">{row.provider}</span>
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {row.evidence.length} document{row.evidence.length === 1 ? "" : "s"} · opened {new Date(row.createdAt).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
      <ActionDialog
        open={opening}
        title="Open a KYC review"
        description="The tenant's admins are asked to upload documents in Settings → Verification."
        confirmLabel="Open review"
        validate={() => (tenant ? null : "Choose a tenant.")}
        onSubmit={async () => {
          if (!tenant) return;
          const created = await open.mutateAsync({ tenantId: tenant.id, provider, ...(note.trim() ? { note: note.trim() } : {}) });
          navigate(`/trust/kyc/${encodeURIComponent(created.id)}`);
        }}
        onClose={() => setOpening(false)}
      >
        {tenant ? (
          <p className="text-sm">
            Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />
          </p>
        ) : (
          <TenantPicker onSelect={setTenant} />
        )}
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Provider
          <select value={provider} onChange={(event) => setProvider(event.target.value)} className={inputClass}>
            <option value="manual">Manual</option>
            <option value="persona" disabled={!personaReady}>
              Persona{personaReady ? "" : " (not configured)"}
            </option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          What to ask the tenant for (optional)
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className={inputClass} />
        </label>
      </ActionDialog>
    </div>
  );
}

export function KycReviewPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const review = useQuery({ queryKey: [...KEY, "review", id], queryFn: async () => (await consoleApi.get<Review & { screenings: Screening[] }>(`/kyc/reviews/${encodeURIComponent(id)}`)).data, enabled: Boolean(id) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });
  const addEvidence = useMutation({ mutationFn: async (body: { fileName: string; contentType: string; dataBase64: string; note?: string }) => (await consoleApi.post<Review>(`/kyc/reviews/${encodeURIComponent(id)}/evidence`, body, { idempotent: true })).data, onSuccess: invalidate });
  const decide = useMutation({ mutationFn: async (body: { decision: string; reason: string }) => (await consoleApi.post<Review>(`/kyc/reviews/${encodeURIComponent(id)}/decision`, body, { idempotent: true })).data, onSuccess: invalidate });
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = review.data;
  const open = data?.status === "OPEN";

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    try {
      await addEvidence.mutateAsync({ fileName: file.name, contentType: file.type, dataBase64: await toBase64(file) });
      setMessage(`${file.name} added.`);
    } catch {
      setError("The file was not added (PDF, PNG or JPEG up to 10 MB).");
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/trust/kyc" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            KYC reviews
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">KYC review {data ? <TenantChip tenantId={data.tenant.id} name={data.tenant.name} slug={data.tenant.slug} /> : null}</h1>
          {data ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {data.status.toLowerCase()} · {data.provider}
              {data.inquiryId ? ` · inquiry ${data.inquiryId}` : ""} · tenant KYC {String(data.tenant.kycStatus ?? "").toLowerCase()}
            </p>
          ) : null}
        </div>
        {open ? (
          <div className="flex gap-2">
            <PermissionButton permission="trust.kyc.approve" onClick={() => setDecision("APPROVED")} className={primary}>
              Approve
            </PermissionButton>
            <PermissionButton permission="trust.kyc.approve" onClick={() => setDecision("REJECTED")} className={secondary}>
              Reject
            </PermissionButton>
          </div>
        ) : null}
      </header>
      <Notice message={message} />
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {review.isError ? <ConsoleApiErrorPanel error={review.error} onRetry={() => void review.refetch()} title="Unable to load the review" /> : null}
      {data ? (
        <>
          {data.requestNote ? <p className="text-sm">Asked the tenant for: {data.requestNote}</p> : null}
          {data.decisionReason ? <p className="text-sm">Decision reason: {data.decisionReason}</p> : null}
          <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h2 className="text-sm font-semibold">Evidence</h2>
            {data.evidence.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No documents yet.</p> : null}
            <ul className="space-y-1 text-sm">
              {data.evidence.map((item) => (
                <li key={item.id} data-testid="kyc-evidence">
                  <a href={`/api/internal/kyc/reviews/${encodeURIComponent(data.id)}/evidence/${encodeURIComponent(item.id)}`} className="underline" target="_blank" rel="noreferrer">
                    {item.fileName}
                  </a>{" "}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    from {item.source === "TENANT" ? "the tenant" : "staff"} · {new Date(item.at).toLocaleString()}
                    {item.note ? ` · ${item.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {open ? (
              <label className={secondary + " inline-flex cursor-pointer"}>
                Add evidence
                <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" aria-label="Evidence file" onChange={(event) => void onFile(event.target.files?.[0])} />
              </label>
            ) : null}
          </section>
          <section className="space-y-1 rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h2 className="text-sm font-semibold">Screenings for this tenant</h2>
            {data.screenings.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">None.</p> : null}
            <ul className="text-xs">
              {data.screenings.map((item) => (
                <li key={item.id}>
                  {new Date(item.createdAt).toLocaleDateString()} · {item.status.toLowerCase()}
                  {item.matchType ? ` (${item.matchType})` : ""} · {item.provider}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
      <ActionDialog
        open={decision !== null}
        dangerous
        title={decision === "APPROVED" ? "Approve this business" : "Reject this verification"}
        description={decision === "APPROVED" ? "Sets the tenant's KYC to approved (needed for Enterprise). An open PEP or sanctions match needs a COMPLIANCE_ADMIN." : "The tenant sees your reason."}
        confirmLabel={decision === "APPROVED" ? "Approve" : "Reject"}
        onSubmit={async (reason) => {
          if (!decision) return;
          await decide.mutateAsync({ decision, reason });
          setMessage(`KYC ${decision.toLowerCase()}.`);
        }}
        onClose={() => setDecision(null)}
      />
    </div>
  );
}

export function ScreeningsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "PENDING";
  const matchType = params.get("matchType") ?? "";
  const screenings = useQuery({ queryKey: [...KEY, "screenings", status, matchType], queryFn: async () => (await consoleApi.get<{ data: Screening[]; complyAdvantage: VendorStatus }>("/kyc/screenings", { params: { status, ...(matchType ? { matchType } : {}) } })).data });
  const decide = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; decision: "CLEAR" | "MATCH"; reason: string; matchType?: string }) => (await consoleApi.post<{ screening: Screening; signalId: string | null }>(`/kyc/screenings/${encodeURIComponent(id)}/decision`, body, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
  const [pending, setPending] = useState<{ row: Screening; decision: "CLEAR" | "MATCH" } | null>(null);
  const [kind, setKind] = useState("SANCTIONS");
  const [message, setMessage] = useState<string | null>(null);
  const rows = screenings.data?.data ?? [];
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Sanctions &amp; PEP screenings</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Monthly rescreens and manual checks. A match opens a LEGAL safety signal for a suspension decision.</p>
        </div>
        <KycNav active="screenings" />
      </header>
      {screenings.data?.complyAdvantage && !screenings.data.complyAdvantage.configured ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy={screenings.data.complyAdvantage.missing.join(", ")}>
          ComplyAdvantage is not configured: screenings are manual — check the tenant against the sanctions lists and decide.
        </DegradedBanner>
      ) : null}
      <Notice message={message} />
      <div className="flex flex-wrap gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Status
          <select aria-label="Screening status" value={status} onChange={(event) => setFilter("status", event.target.value)} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
            <option value="PENDING">To decide</option>
            <option value="MATCH">Match</option>
            <option value="CLEAR">Clear</option>
            <option value="ALL">All</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Type
          <select aria-label="Match type" value={matchType} onChange={(event) => setFilter("matchType", event.target.value)} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
            <option value="">Any</option>
            <option value="SANCTIONS">Sanctions</option>
            <option value="PEP">PEP</option>
            <option value="ADVERSE_MEDIA">Adverse media</option>
          </select>
        </label>
      </div>
      {screenings.isError ? <ConsoleApiErrorPanel error={screenings.error} onRetry={() => void screenings.refetch()} title="Unable to load screenings" /> : null}
      {screenings.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">Nothing to show.</p> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="screening-row">
            <span className="flex items-center gap-2">
              <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
              <span className="text-xs">
                {row.status.toLowerCase()}
                {row.matchType ? ` · ${row.matchType}` : ""} · {row.provider} · {(row.source ?? "").toLowerCase().replace("_", " ")}
              </span>
            </span>
            {row.status === "PENDING" ? (
              <span className="flex gap-2">
                <PermissionButton permission="trust.kyc.approve" onClick={() => setPending({ row, decision: "CLEAR" })} className={secondary}>
                  Clear
                </PermissionButton>
                <PermissionButton permission="trust.kyc.approve" onClick={() => setPending({ row, decision: "MATCH" })} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
                  Match
                </PermissionButton>
              </span>
            ) : (
              <span className="text-xs text-[var(--color-text-muted)]">{row.decisionReason}</span>
            )}
          </li>
        ))}
      </ul>
      <ActionDialog
        open={pending !== null}
        dangerous
        title={pending?.decision === "MATCH" ? `Record a match for ${pending.row.tenant.name}` : `Clear ${pending?.row.tenant.name ?? ""}`}
        description={pending?.decision === "MATCH" ? "Opens a LEGAL safety signal; suspending the tenant is a separate decision in Trust & Safety." : "No match: the screening is closed."}
        confirmLabel={pending?.decision === "MATCH" ? "Record match" : "Clear"}
        onSubmit={async (reason) => {
          if (!pending) return;
          const result = await decide.mutateAsync({ id: pending.row.id, decision: pending.decision, reason, ...(pending.decision === "MATCH" ? { matchType: kind } : {}) });
          setMessage(result.signalId ? "Match recorded; a LEGAL signal is open in Trust & Safety." : "Cleared.");
        }}
        onClose={() => setPending(null)}
      >
        {pending?.decision === "MATCH" ? (
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Match type
            <select value={kind} onChange={(event) => setKind(event.target.value)} className={inputClass}>
              <option value="SANCTIONS">Sanctions</option>
              <option value="PEP">PEP</option>
              <option value="ADVERSE_MEDIA">Adverse media</option>
            </select>
          </label>
        ) : null}
      </ActionDialog>
    </div>
  );
}
