import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { consoleApi } from "@/lib/console-api";
import { consoleApiUrl } from "@/lib/console-api-origin";

// revenue.tax (WP-4.7): TaxOverviewPage, RegistrationsPage, ExemptionsPage. Approving an exemption sets the tenant's
// taxExempt flag, which Fauward invoices read (0 tax plus a note) and which is mirrored to Stripe when configured.

type VendorStatus = { vendor: string; configured: boolean; missing: string[] } | null;
type Registration = { id: string; region: string; taxId: string; filingFrequency: string; status: string; updatedAt: string };
type Exemption = {
  id: string;
  tenant: { id: string; name: string; slug: string | null; taxExempt: boolean };
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  fileName: string | null;
  contentType: string | null;
  byteSize: number | null;
  certificateUrl: string | null;
  submittedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  revokedAt: string | null;
};
type Overview = { registrations: Registration[]; pendingExemptions: Exemption[]; exemptTenants: number; vendors: { stripeTax: VendorStatus; anrok: VendorStatus; stripe: VendorStatus } };
type Mirror = { status: "MIRRORED" | "FAILED" | "NOT_CONFIGURED" | "NO_STRIPE_CUSTOMER"; error: string | null } | null;

const KEY = ["revenue.tax"] as const;
const input = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";

function TaxNav({ active }: { active: "overview" | "registrations" | "exemptions" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Tax sections">
      {item("overview", "/revenue/tax", "Overview")}
      {item("registrations", "/revenue/tax/registrations", "Registrations")}
      {item("exemptions", "/revenue/tax/exemptions", "Exemptions")}
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

export function TaxOverviewPage() {
  const overview = useQuery({
    queryKey: [...KEY, "overview"],
    queryFn: async () => {
      const data = (await consoleApi.get<Partial<Overview>>("/tax/overview")).data;
      return { registrations: data.registrations ?? [], pendingExemptions: data.pendingExemptions ?? [], exemptTenants: data.exemptTenants ?? 0, vendors: { stripeTax: data.vendors?.stripeTax ?? null, anrok: data.vendors?.anrok ?? null, stripe: data.vendors?.stripe ?? null } } satisfies Overview;
    }
  });
  const data = overview.data;
  const rateVendors = data ? [data.vendors.stripeTax, data.vendors.anrok] : [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Tax</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Fauward&apos;s tax registrations and the tenants exempt from tax on Fauward invoices.</p>
        </div>
        <TaxNav active="overview" />
      </header>
      {overview.isError ? <ConsoleApiErrorPanel error={overview.error} onRetry={() => void overview.refetch()} title="Unable to load tax" /> : null}
      {data && rateVendors.every((vendor) => vendor && !vendor.configured) ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy="ANROK_API_KEY or STRIPE_SECRET_KEY (Stripe Tax)">
          No tax-rate vendor is configured: the tax rate on a Fauward invoice is entered by staff. Exemptions work without a vendor.
        </DegradedBanner>
      ) : null}
      {data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="tax-registrations-count">
            <p className="text-xs text-[var(--color-text-muted)]">Registrations</p>
            <p className="text-2xl font-bold">{data.registrations.length}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="tax-pending-count">
            <p className="text-xs text-[var(--color-text-muted)]">Certificates to review</p>
            <p className="text-2xl font-bold">{data.pendingExemptions.length}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="tax-exempt-count">
            <p className="text-xs text-[var(--color-text-muted)]">Tax-exempt tenants</p>
            <p className="text-2xl font-bold">{data.exemptTenants}</p>
          </div>
        </div>
      ) : null}
      {data && data.pendingExemptions.length > 0 ? (
        <p className="text-sm">
          <Link to="/revenue/tax/exemptions" className="underline">
            Review {data.pendingExemptions.length} certificate{data.pendingExemptions.length === 1 ? "" : "s"}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function RegistrationsPage() {
  const queryClient = useQueryClient();
  const registrations = useQuery({ queryKey: [...KEY, "registrations"], queryFn: async () => (await consoleApi.get<{ data: Registration[] }>("/tax/registrations")).data.data });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });
  const create = useMutation({ mutationFn: async (body: { region: string; taxId: string; filingFrequency: string }) => (await consoleApi.post<Registration>("/tax/registrations", body, { idempotent: true })).data, onSuccess: invalidate });
  const patch = useMutation({ mutationFn: async ({ id, ...body }: { id: string; status?: string; filingFrequency?: string }) => (await consoleApi.patch<Registration>(`/tax/registrations/${encodeURIComponent(id)}`, body)).data, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: async (id: string) => (await consoleApi.delete(`/tax/registrations/${encodeURIComponent(id)}`)).data, onSuccess: invalidate });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Registration | null>(null);
  const [region, setRegion] = useState("");
  const [taxId, setTaxId] = useState("");
  const [frequency, setFrequency] = useState("QUARTERLY");
  const [message, setMessage] = useState<string | null>(null);
  const rows = registrations.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Tax registrations</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Where Fauward is registered for VAT/GST/sales tax.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TaxNav active="registrations" />
          <PermissionButton permission="revenue.tax.write" onClick={() => setAdding(true)} className={primary}>
            Add registration
          </PermissionButton>
        </div>
      </header>
      <Notice message={message} />
      {registrations.isError ? <ConsoleApiErrorPanel error={registrations.error} onRetry={() => void registrations.refetch()} title="Unable to load registrations" /> : null}
      {registrations.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tax registrations recorded.</p> : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="registration-row">
              <span>
                <span className="font-semibold">{row.region}</span> · <span className="font-mono">{row.taxId}</span> · files {row.filingFrequency.toLowerCase()}
                {row.status !== "ACTIVE" ? <span className="text-xs text-[var(--color-text-muted)]"> · inactive</span> : null}
              </span>
              <span className="flex gap-2">
                <PermissionButton permission="revenue.tax.write" onClick={() => void patch.mutateAsync({ id: row.id, status: row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }).then(() => setMessage(`${row.region} ${row.status === "ACTIVE" ? "deactivated" : "reactivated"}.`))} className="text-xs underline">
                  {row.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                </PermissionButton>
                <PermissionButton permission="revenue.tax.write" onClick={() => setDeleting(row)} className="text-xs text-red-700 underline">
                  Delete
                </PermissionButton>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ActionDialog
        open={adding}
        title="Add a tax registration"
        confirmLabel="Add"
        validate={() => (region.trim().length >= 2 && taxId.trim().length >= 2 ? null : "Enter the region and the tax id.")}
        onSubmit={async () => {
          await create.mutateAsync({ region: region.trim(), taxId: taxId.trim(), filingFrequency: frequency });
          setMessage(`Registration ${region.trim()} added.`);
          setRegion("");
          setTaxId("");
        }}
        onClose={() => setAdding(false)}
      >
        <label className={label}>
          Region
          <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="GB" className={input} />
        </label>
        <label className={label}>
          Tax id
          <input value={taxId} onChange={(event) => setTaxId(event.target.value)} className={input} />
        </label>
        <label className={label}>
          Filing frequency
          <select value={frequency} onChange={(event) => setFrequency(event.target.value)} className={input}>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUAL">Annual</option>
          </select>
        </label>
      </ActionDialog>
      <ActionDialog
        open={deleting !== null}
        title={`Delete ${deleting?.region ?? ""} ${deleting?.taxId ?? ""}?`}
        confirmLabel="Delete"
        onSubmit={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          setMessage("Registration deleted.");
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

const DECISION_COPY = {
  APPROVE: { title: "Approve this exemption", confirm: "Approve", description: "The tenant's next Fauward invoices carry no tax; the tenant is told." },
  REJECT: { title: "Reject this certificate", confirm: "Reject", description: "The tenant sees your reason and can upload a new certificate." },
  REVOKE: { title: "Revoke this exemption", confirm: "Revoke", description: "Tax applies again from the next Fauward invoice; the tenant sees your reason." }
} as const;

function mirrorText(mirror: Mirror) {
  if (!mirror) return "";
  if (mirror.status === "MIRRORED") return " Stripe updated.";
  if (mirror.status === "FAILED") return ` Stripe could not be updated (${mirror.error ?? "error"}); update the customer's tax status in Stripe.`;
  return "";
}

export function ExemptionsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "PENDING";
  const exemptions = useQuery({ queryKey: [...KEY, "exemptions", status], queryFn: async () => (await consoleApi.get<{ data: Exemption[] }>("/tax/exemptions", { params: { status } })).data.data });
  const decide = useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string; decision: keyof typeof DECISION_COPY; reason: string }) =>
      (await consoleApi.post<{ exemption: { status: string }; stripeMirror: Mirror }>(`/tax/exemptions/${encodeURIComponent(id)}/decision`, { decision, reason }, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
  const [pending, setPending] = useState<{ row: Exemption; decision: keyof typeof DECISION_COPY } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rows = exemptions.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Tax exemptions</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Certificates tenants uploaded in Settings → Billing.</p>
        </div>
        <TaxNav active="exemptions" />
      </header>
      <Notice message={message} />
      <label className={label}>
        Status
        <select aria-label="Exemption status" value={status} onChange={(event) => setParams({ status: event.target.value }, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="PENDING">To review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="REVOKED">Revoked</option>
          <option value="ALL">All</option>
        </select>
      </label>
      {exemptions.isError ? <ConsoleApiErrorPanel error={exemptions.error} onRetry={() => void exemptions.refetch()} title="Unable to load exemptions" /> : null}
      {exemptions.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">{status === "PENDING" ? "No certificate waits for review." : "None."}</p> : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="exemption-row">
              <span>
                <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />{" "}
                {row.certificateUrl ? (
                  <a href={consoleApiUrl(row.certificateUrl)} className="text-xs underline" target="_blank" rel="noreferrer">
                    {row.fileName ?? "certificate"}
                  </a>
                ) : (
                  <span className="text-xs text-[var(--color-text-muted)]">no file</span>
                )}
                <span className="text-xs text-[var(--color-text-muted)]">
                  {" "}
                  · {row.status.toLowerCase()} · uploaded {new Date(row.submittedAt).toLocaleDateString()}
                  {row.decisionReason ? ` · ${row.decisionReason}` : ""}
                </span>
              </span>
              <span className="flex gap-2">
                {row.status === "PENDING" ? (
                  <>
                    <PermissionButton permission="revenue.tax.write" onClick={() => setPending({ row, decision: "APPROVE" })} className={primary}>
                      Approve
                    </PermissionButton>
                    <PermissionButton permission="revenue.tax.write" onClick={() => setPending({ row, decision: "REJECT" })} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold">
                      Reject
                    </PermissionButton>
                  </>
                ) : null}
                {row.status === "APPROVED" ? (
                  <PermissionButton permission="revenue.tax.write" onClick={() => setPending({ row, decision: "REVOKE" })} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
                    Revoke
                  </PermissionButton>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ActionDialog
        open={pending !== null}
        dangerous
        title={pending ? `${DECISION_COPY[pending.decision].title}: ${pending.row.tenant.name}` : ""}
        description={pending ? DECISION_COPY[pending.decision].description : undefined}
        confirmLabel={pending ? DECISION_COPY[pending.decision].confirm : ""}
        onSubmit={async (reason) => {
          if (!pending) return;
          const result = await decide.mutateAsync({ id: pending.row.id, decision: pending.decision, reason });
          setMessage(`${pending.row.tenant.name}: exemption ${result.exemption.status.toLowerCase()}.${mirrorText(result.stripeMirror)}`);
        }}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
