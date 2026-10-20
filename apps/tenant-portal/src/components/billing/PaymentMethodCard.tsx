import type { BillingSummary } from "@/types/billing";

type PaymentMethodCardProps = {
  summary: BillingSummary;
};

/** Fauward never stores card details: with Stripe they live in Stripe, otherwise Fauward bills by invoice. */
export function PaymentMethodCard({ summary }: PaymentMethodCardProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-base font-semibold text-gray-900">Payment method</h3>
      <p className="mt-2 text-sm text-gray-600">
        {summary.managedByStripe
          ? "Your card is held securely by Stripe, Fauward's payment processor."
          : "Fauward bills this workspace by invoice. Invoices from Fauward are listed above."}
      </p>
    </section>
  );
}
