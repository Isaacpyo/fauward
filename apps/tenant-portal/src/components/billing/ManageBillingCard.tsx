import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { apiErrorCode, apiErrorMessage } from "@/lib/api-error";
import type { BillingSummary } from "@/types/billing";
import { useBillingPortal, useContactBilling, useRedeemSaveOffer } from "./plan-change-api";

/**
 * "Manage billing" opens the Stripe billing portal; without one the API answers BILLING_PORTAL_UNAVAILABLE and the
 * tenant writes to Fauward billing instead (a BILLING_QUERY ticket, ACC-SUB-5). Also redeems an approved save offer.
 */
export function ManageBillingCard({ summary }: { summary: BillingSummary }) {
  const portal = useBillingPortal();
  const contact = useContactBilling();
  const redeem = useRedeemSaveOffer();
  const [contactOpen, setContactOpen] = useState(false);
  const [subject, setSubject] = useState("Billing question");
  const [body, setBody] = useState("");

  const openPortal = () =>
    portal.mutate(undefined, {
      onSuccess: (result) => window.location.assign(result.url),
      onError: (error) => {
        if (apiErrorCode(error) === "BILLING_PORTAL_UNAVAILABLE") setContactOpen(true);
      }
    });

  const sendContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    contact.mutate({ subject: subject.trim(), body: body.trim() });
  };

  const portalUnavailable = apiErrorCode(portal.error) === "BILLING_PORTAL_UNAVAILABLE";

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Manage billing</h3>
          <p className="text-sm text-gray-600">Payment method, billing details and receipts.</p>
        </div>
        <Button variant="secondary" onClick={openPortal} loading={portal.isPending} disabled={portal.isPending}>
          Manage billing
        </Button>
      </div>
      {portal.isError && !portalUnavailable ? <p className="text-sm text-red-700">{apiErrorMessage(portal.error, "The billing portal could not be opened.")}</p> : null}

      {contactOpen ? (
        contact.data ? (
          <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Sent to Fauward billing as ticket {contact.data.ticket.ticketNumber}.{" "}
            <Link to={`/help/tickets/${contact.data.ticket.id}`} className="font-semibold underline">
              Follow it here
            </Link>
            .
          </p>
        ) : (
          <form className="space-y-2" onSubmit={sendContact} aria-label="Contact Fauward billing">
            <p className="text-sm text-gray-700">{apiErrorMessage(portal.error, "Online billing management is not available for this workspace.")} Write to Fauward billing:</p>
            <Input aria-label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} required />
            <Textarea aria-label="Message to Fauward billing" value={body} onChange={(event) => setBody(event.target.value)} rows={4} required placeholder="What would you like to change or ask?" />
            {contact.isError ? <p className="text-sm text-red-700">{apiErrorMessage(contact.error, "The message could not be sent.")}</p> : null}
            <Button type="submit" loading={contact.isPending} disabled={contact.isPending || body.trim().length < 10 || subject.trim().length < 3}>
              Send to billing
            </Button>
          </form>
        )
      ) : null}

      {summary.saveOffer ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="save-offer">
          {redeem.data ? (
            <p role="status">
              {redeem.data.via === "CREDIT_NOTE" ? `Credit of ${redeem.data.amount} applied to invoice ${redeem.data.invoiceNumber}.` : "The discount was applied to your next Stripe invoice."}
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                Offer <span className="font-semibold">{summary.saveOffer.code}</span>: {summary.saveOffer.discount.toFixed(2)} credit, valid until {new Date(summary.saveOffer.validUntil).toLocaleDateString()}.
              </p>
              <Button size="sm" onClick={() => redeem.mutate(summary.saveOffer!.code)} loading={redeem.isPending} disabled={redeem.isPending}>
                Redeem
              </Button>
            </div>
          )}
          {redeem.isError ? <p className="mt-1 text-red-700">{apiErrorMessage(redeem.error, "The offer could not be redeemed.")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
