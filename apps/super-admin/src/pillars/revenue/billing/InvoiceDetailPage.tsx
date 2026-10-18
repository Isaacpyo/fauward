import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { MoneyCell, formatMoney } from "@/components/service-kit/MoneyCell";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { toConsoleApiError } from "@/lib/console-api-error";
import { createRefund, type InvoiceDetail, type LedgerKind, type Payment, useCreateCreditNote, useInvoice, useRecordPayment, useVoidInvoice } from "./api";

const card = "rounded-lg border border-[var(--color-border)] bg-white p-4";
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const field = "mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const actionButton = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const AMOUNT = /^\d+(\.\d{1,3})?$/;

type Dialog = { kind: "payment" } | { kind: "credit" } | { kind: "void" } | { kind: "refund"; payment: Payment } | null;

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function AmountDialog({ open, title, description, confirmLabel, currency, onClose, onSubmit }: { open: boolean; title: string; description: string; confirmLabel: string; currency: string; onClose: () => void; onSubmit: (amount: string, reason: string) => Promise<unknown> }) {
  const [amount, setAmount] = useState("");
  return (
    <ActionDialog
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      dangerous
      validate={() => (AMOUNT.test(amount.trim()) ? null : `Enter an amount in ${currency}, e.g. 12.50`)}
      onClose={() => {
        setAmount("");
        onClose();
      }}
      onSubmit={async (reason) => {
        await onSubmit(amount.trim(), reason);
        setAmount("");
      }}
    >
      <div>
        <label className={label} htmlFor="billing-amount">
          Amount ({currency})
        </label>
        <input id="billing-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={field} />
      </div>
    </ActionDialog>
  );
}

function Totals({ invoice }: { invoice: InvoiceDetail }) {
  const rows: Array<[string, string | undefined]> = [
    ["Subtotal", invoice.subtotal],
    [`Tax (${invoice.taxRate}%)`, invoice.taxAmount],
    ["Total", invoice.total],
    ["Paid", invoice.paid],
    ["Credited", invoice.credited],
    ["Outstanding", invoice.outstanding]
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {rows.map(([name, amount]) => (
        <div key={name} className="contents">
          <dt className="text-[var(--color-text-muted)]">{name}</dt>
          <dd className="text-right" data-testid={`invoice-${name.split(" ")[0].toLowerCase()}`}>
            <MoneyCell amount={amount} currency={invoice.currency} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Invoice → payments → refunds → approvals, plus credit notes (WP-1.5). PLATFORM invoices can be paid, credited, voided. */
export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const kind: LedgerKind = params.get("kind") === "TENANT_CUSTOMER" ? "TENANT_CUSTOMER" : "PLATFORM";
  const query = useInvoice(id, kind);
  const recordPayment = useRecordPayment();
  const credit = useCreateCreditNote();
  const voidInvoice = useVoidInvoice();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (query.isError) {
    if (toConsoleApiError(query.error).status === 404) return <p className={card}>Invoice not found on the {kind === "PLATFORM" ? "Fauward" : "tenant customer"} ledger.</p>;
    return <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load the invoice" />;
  }
  if (!query.data) return <p className="text-sm text-[var(--color-text-muted)]">Loading invoice…</p>;
  const invoice = query.data;
  const writable = !invoice.readOnly && invoice.status !== "VOID";

  return (
    <div className="space-y-4">
      <header className={card}>
        <Link to={`/revenue/billing/invoices${kind === "PLATFORM" ? "" : "?kind=TENANT_CUSTOMER"}`} className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
          Invoices
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{invoice.invoiceNumber}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {invoice.tenant ? <TenantChip tenantId={invoice.tenant.id} name={invoice.tenant.name} slug={invoice.tenant.slug} /> : invoice.tenantId} · <span data-testid="invoice-status">{invoice.status}</span> · due {when(invoice.dueDate)}
            </p>
            {invoice.readOnly ? <p className="mt-1 text-xs font-semibold text-amber-800">A tenant&apos;s own customer invoice — read-only in the console.</p> : null}
          </div>
          {!invoice.readOnly ? (
            <div className="flex flex-wrap gap-2">
              <PermissionButton permission="revenue.invoices.write" disabled={!writable || invoice.outstanding === "0.00"} onClick={() => setDialog({ kind: "payment" })} className={actionButton}>
                Record payment
              </PermissionButton>
              <PermissionButton permission="revenue.invoices.write" disabled={!writable || invoice.outstanding === "0.00"} onClick={() => setDialog({ kind: "credit" })} className={actionButton}>
                Issue credit note
              </PermissionButton>
              <PermissionButton permission="revenue.invoices.write" disabled={!writable} onClick={() => setDialog({ kind: "void" })} className={`${actionButton} border-red-300 text-red-700`}>
                Void
              </PermissionButton>
            </div>
          ) : null}
        </div>
      </header>

      {notice ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${card} lg:col-span-2`}>
          <h2 className="text-sm font-semibold">Line items</h2>
          <table className="mt-2 min-w-full text-sm">
            <thead className="text-left text-xs text-[var(--color-text-muted)]">
              <tr>
                <th className="py-1">Description</th>
                <th className="py-1 text-right">Qty</th>
                <th className="py-1 text-right">Unit</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(Array.isArray(invoice.lineItems) ? invoice.lineItems : []).map((line, index) => (
                <tr key={index}>
                  <td className="py-1">{line.description}</td>
                  <td className="py-1 text-right tabular-nums">{line.quantity}</td>
                  <td className="py-1 text-right">
                    <MoneyCell amount={String(line.unitAmount)} currency={invoice.currency} />
                  </td>
                  <td className="py-1 text-right">
                    <MoneyCell amount={(Number(line.unitAmount) * line.quantity).toFixed(2)} currency={invoice.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={card}>
          <h2 className="text-sm font-semibold">Balance</h2>
          <div className="mt-2">
            <Totals invoice={invoice} />
          </div>
        </section>
      </div>

      <section className={card}>
        <h2 className="text-sm font-semibold">Payments, refunds and approvals</h2>
        {invoice.payments.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">No payments yet.</p> : null}
        <ul className="mt-2 space-y-3">
          {invoice.payments.map((payment) => (
            <li key={payment.id} data-testid="invoice-payment" className="rounded-md border border-[var(--color-border)] p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <MoneyCell amount={payment.amount} currency={payment.currency} /> · {payment.method ?? "card"} · {payment.status} · {when(payment.createdAt)}
                </span>
                {!invoice.readOnly && payment.status === "COMPLETED" ? (
                  <PermissionButton permission="revenue.invoices.refund" onClick={() => setDialog({ kind: "refund", payment })} className={actionButton}>
                    Refund
                  </PermissionButton>
                ) : null}
              </div>
              {payment.refunds.length > 0 ? (
                <ul className="mt-2 space-y-1 border-l-2 border-[var(--color-border)] pl-3">
                  {payment.refunds.map((refund) => (
                    <li key={refund.id} className="text-xs">
                      Refund <MoneyCell amount={refund.amount} currency={refund.currency ?? payment.currency} /> · {refund.status}
                      {refund.failureReason ? ` (${refund.failureReason})` : ""} · {when(refund.createdAt)}
                      {(refund.approvals ?? []).map((approval) => (
                        <span key={approval.id} className="ml-2 text-[var(--color-text-muted)]">
                          approval {approval.status.toLowerCase()} {approval.decidedAt ? when(approval.decidedAt) : ""}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold">Credit notes</h2>
        {invoice.creditNotes.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">No credit notes.</p> : null}
        <ul className="mt-2 divide-y divide-[var(--color-border)] text-sm">
          {invoice.creditNotes.map((note) => (
            <li key={note.id} className="py-1">
              <span className="font-mono text-xs">{note.creditNumber}</span> · <MoneyCell amount={note.amount} currency={note.currency} /> · {note.reason ?? "—"} · {when(note.createdAt)}
            </li>
          ))}
        </ul>
      </section>

      <AmountDialog
        open={dialog?.kind === "payment"}
        title={`Record a payment on ${invoice.invoiceNumber}`}
        description={`Outstanding: ${formatMoney(invoice.outstanding, invoice.currency)}. Paying it in full marks the invoice paid and lifts a billing suspension opened for it.`}
        confirmLabel="Record payment"
        currency={invoice.currency}
        onClose={() => setDialog(null)}
        onSubmit={async (amount, reason) => {
          const result = await recordPayment.mutateAsync({ invoiceId: invoice.id, amount, method: "BANK_TRANSFER", reason });
          setNotice(`Payment of ${formatMoney(amount, invoice.currency)} recorded; the invoice is ${result.invoiceStatus.toLowerCase().replace("_", " ")}.${result.liftedSuspension ? " The billing suspension was lifted." : ""}`);
        }}
      />
      <AmountDialog
        open={dialog?.kind === "credit"}
        title={`Credit ${invoice.invoiceNumber}`}
        description={`A credit can be at most the outstanding ${formatMoney(invoice.outstanding, invoice.currency)}.`}
        confirmLabel="Issue credit note"
        currency={invoice.currency}
        onClose={() => setDialog(null)}
        onSubmit={async (amount, reason) => {
          const note = await credit.mutateAsync({ invoiceId: invoice.id, amount, reason });
          setNotice(`Credit note ${note.creditNumber} for ${formatMoney(note.amount, note.currency)} issued.`);
        }}
      />
      <AmountDialog
        open={dialog?.kind === "refund"}
        title="Refund this payment"
        description="Refunds above the large-refund threshold, or without a card payment, go to a second approver."
        confirmLabel="Refund"
        currency={dialog?.kind === "refund" ? dialog.payment.currency : invoice.currency}
        onClose={() => setDialog(null)}
        onSubmit={async (amount, reason) => {
          if (dialog?.kind !== "refund") return;
          const result = await createRefund({ paymentId: dialog.payment.id, amount, reason });
          await query.refetch();
          setNotice(result.approvalRequired ? "The refund is waiting for a second approver." : `Refund ${result.refund.status.toLowerCase()}.`);
        }}
      />
      <ActionDialog
        open={dialog?.kind === "void"}
        title={`Void ${invoice.invoiceNumber}?`}
        description="Only an invoice without payments can be voided; otherwise refund or credit it."
        confirmLabel="Void invoice"
        dangerous
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          await voidInvoice.mutateAsync({ id: invoice.id, reason });
          setNotice(`${invoice.invoiceNumber} is void.`);
        }}
      />
    </div>
  );
}
