import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ChangePlanModal } from "@/components/billing/ChangePlanModal";
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard";
import { FauwardInvoicesTable } from "@/components/billing/FauwardInvoicesTable";
import { ManageBillingCard } from "@/components/billing/ManageBillingCard";
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard";
import { PlanComparisonTable } from "@/components/billing/PlanComparisonTable";
import { TaxExemptionCard } from "@/components/billing/TaxExemptionCard";
import { UsageSection } from "@/components/billing/UsageSection";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBilling } from "@/hooks/useBilling";
import { apiErrorMessage } from "@/lib/api-error";

export function BillingTab() {
  const billing = useBilling();
  const { summary } = billing;
  const [params] = useSearchParams();
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const checkout = params.get("checkout");

  if (billing.isError) {
    return <ErrorState title="Billing could not be loaded" description={apiErrorMessage(billing.error, "The billing service returned an error.")} onRetry={() => void billing.refetch()} />;
  }
  if (!summary) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-4">
      {checkout === "success" ? (
        <p role="status" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Stripe checkout finished. Your plan updates here as soon as Stripe confirms the subscription.
        </p>
      ) : null}
      {checkout === "cancelled" ? <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">Checkout was cancelled; your plan has not changed.</p> : null}
      <CurrentPlanCard summary={summary} onChangePlan={() => setChangePlanOpen(true)} />
      <UsageSection summary={summary} onUpgrade={() => setChangePlanOpen(true)} />
      <PlanComparisonTable currentPlan={summary.plan} onUpgradePlan={() => setChangePlanOpen(true)} />
      <ManageBillingCard summary={summary} />
      <FauwardInvoicesTable />
      <TaxExemptionCard />
      <PaymentMethodCard summary={summary} />

      <ChangePlanModal open={changePlanOpen} onOpenChange={setChangePlanOpen} />
    </div>
  );
}
