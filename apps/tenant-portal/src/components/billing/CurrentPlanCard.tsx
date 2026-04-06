import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { BillingSummary } from "@/types/billing";

type CurrentPlanCardProps = {
  summary: BillingSummary;
  onChangePlan: () => void;
  onManageBilling: () => void;
};

export function CurrentPlanCard({
  summary,
  onChangePlan,
  onManageBilling
}: CurrentPlanCardProps) {
  const tenant = useTenantStore((state) => state.tenant);

  const badgeVariant =
    summary.plan === "starter"
      ? "neutral"
      : summary.plan === "pro"
        ? "primary"
        : "info";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant={badgeVariant}>{summary.plan.toUpperCase()}</Badge>
          <p className="mt-2 text-lg font-semibold text-gray-900">
            {summary.cycle === "monthly" ? "Monthly" : "Annual"} ·{" "}
            {formatCurrency(summary.amount, tenant)}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Renewal date: {formatDateTime(summary.renewalDate, tenant)}
          </p>
          {typeof summary.trialDaysRemaining === "number" && summary.trialDaysRemaining > 0 ? (
            <Badge variant="warning" className="mt-2">
              Trial - {summary.trialDaysRemaining} days remaining
            </Badge>
          ) : null}
          {summary.paymentStatus === "suspended" ? (
            <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              Your account is suspended due to failed payment. Update payment method to restore access.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onChangePlan}>
            Change Plan
          </Button>
          <Button variant="secondary" onClick={onManageBilling}>
            Manage Billing
          </Button>
        </div>
      </div>
    </section>
  );
}
