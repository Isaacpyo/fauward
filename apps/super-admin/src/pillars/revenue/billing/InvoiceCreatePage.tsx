import { useState } from "react";
import { Link } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { formatMoney } from "@/components/service-kit/MoneyCell";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { type Invoice, type LineItem, useCreateInvoice } from "./api";

const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const field = "mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const AMOUNT = /^\d+(\.\d{1,3})?$/;

type DraftLine = { description: string; quantity: string; unitAmount: string };

function validLines(lines: DraftLine[]): LineItem[] | null {
  const parsed = lines.map((line) => ({ description: line.description.trim(), quantity: Number(line.quantity), unitAmount: line.unitAmount.trim() }));
  const ok = parsed.length > 0 && parsed.every((line) => line.description && Number.isInteger(line.quantity) && line.quantity >= 1 && AMOUNT.test(line.unitAmount));
  return ok ? parsed : null;
}

/** Manual PLATFORM invoice (WP-1.5). Without Stripe this is how Fauward bills a tenant; "send" notifies its admins. */
export function InvoiceCreatePage() {
  const create = useCreateInvoice();
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([{ description: "", quantity: "1", unitAmount: "" }]);
  const [currency, setCurrency] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [send, setSend] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [created, setCreated] = useState<Invoice | null>(null);

  const parsedLines = validLines(lines);
  const canReview = Boolean(tenant) && parsedLines !== null && (currency === "" || /^[A-Z]{3}$/.test(currency)) && AMOUNT.test(taxRate || "0");

  return (
    <div className="space-y-4">
      <header>
        <Link to="/revenue/billing/invoices" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
          Invoices
        </Link>
        <h1 className="mt-1 text-xl font-bold text-[var(--color-text-primary)]">New invoice to a tenant</h1>
      </header>

      {created ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Invoice {created.invoiceNumber} for {formatMoney(created.total, created.currency)} {created.status === "SENT" ? "was sent; the tenant's admins have been notified." : "was saved as a draft."}{" "}
          <Link to={`/revenue/billing/invoices/${created.id}`} className="font-semibold underline">
            Open it
          </Link>
        </p>
      ) : null}

      <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
        {tenant ? (
          <p className="text-sm">
            Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />{" "}
            <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)]" onClick={() => setTenant(null)}>
              Change
            </button>
          </p>
        ) : (
          <TenantPicker onSelect={setTenant} label="Tenant" />
        )}

        <fieldset className="space-y-2">
          <legend className={label}>Line items</legend>
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[1fr_6rem_9rem_auto]">
              <input aria-label={`Description ${index + 1}`} placeholder="Description" value={line.description} onChange={(event) => setLines((current) => current.map((item, i) => (i === index ? { ...item, description: event.target.value } : item)))} className={field} />
              <input aria-label={`Quantity ${index + 1}`} inputMode="numeric" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, i) => (i === index ? { ...item, quantity: event.target.value } : item)))} className={field} />
              <input aria-label={`Unit amount ${index + 1}`} inputMode="decimal" placeholder="0.00" value={line.unitAmount} onChange={(event) => setLines((current) => current.map((item, i) => (i === index ? { ...item, unitAmount: event.target.value } : item)))} className={field} />
              <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="mt-1 rounded-md border border-[var(--color-border)] px-2 text-xs disabled:opacity-40">
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setLines((current) => [...current, { description: "", quantity: "1", unitAmount: "" }])} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold">
            Add line
          </button>
        </fieldset>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className={label} htmlFor="invoice-currency">
              Currency (blank = the tenant&apos;s default)
            </label>
            <input id="invoice-currency" maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="invoice-tax">
              Tax rate % (ignored for tax-exempt tenants)
            </label>
            <input id="invoice-tax" inputMode="decimal" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="invoice-due">
              Due date
            </label>
            <input id="invoice-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={field} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="invoice-notes">
            Notes for the tenant
          </label>
          <textarea id="invoice-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className={field} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={send} onChange={(event) => setSend(event.target.checked)} />
          Send now (notify the tenant&apos;s admins); otherwise save as a draft
        </label>
        <PermissionButton permission="revenue.invoices.write" disabled={!canReview} onClick={() => setConfirming(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Review invoice
        </PermissionButton>
      </section>

      <ActionDialog
        open={confirming}
        title={send ? `Send this invoice to ${tenant?.name ?? "the tenant"}?` : `Save a draft invoice for ${tenant?.name ?? "the tenant"}?`}
        description={`${parsedLines?.length ?? 0} line item(s)${currency ? ` in ${currency}` : ""}. Totals and tax are calculated by the server.`}
        confirmLabel={send ? "Create and send" : "Save draft"}
        onClose={() => setConfirming(false)}
        onSubmit={async () => {
          const invoice = await create.mutateAsync({
            tenantId: tenant!.id,
            lineItems: parsedLines!,
            ...(currency ? { currency } : {}),
            taxRate: taxRate || "0",
            ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
            send
          });
          setCreated(invoice);
        }}
      />
    </div>
  );
}
