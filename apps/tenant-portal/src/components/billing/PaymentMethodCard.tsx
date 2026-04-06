import type { BillingSummary } from "@/types/billing";
import { Button } from "@/components/ui/Button";

type PaymentMethodCardProps = {
  summary: BillingSummary;
  onManageBilling: () => void;
};

export function PaymentMethodCard({ summary, onManageBilling }: PaymentMethodCardProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-base font-semibold text-gray-900">Payment method</h3>
      {summary.paymentMethod ? (
        <p className="mt-2 text-sm text-gray-700">
          {summary.paymentMethod.brand} - •••• {summary.paymentMethod.last4}, exp{" "}
          {summary.paymentMethod.expMonth}/{String(summary.paymentMethod.expYear).slice(-2)}
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-600">No payment method on file.</p>
      )}
      <Button variant="secondary" className="mt-3" onClick={onManageBilling}>
        Update payment method
      </Button>
    </section>
  );
}
