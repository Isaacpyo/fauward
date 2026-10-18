import { useState } from "react";

import { ChangePlanModal } from "@/components/billing/ChangePlanModal";
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard";
import { FauwardInvoicesTable } from "@/components/billing/FauwardInvoicesTable";
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard";
import { PlanComparisonTable } from "@/components/billing/PlanComparisonTable";
import { UsageSection } from "@/components/billing/UsageSection";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBilling } from "@/hooks/useBilling";
import { apiErrorMessage } from "@/lib/api-error";
import type { BillingPlan } from "@/types/billing";
import { useAppStore } from "@/stores/useAppStore";

export function BillingTab() {
  const billing = useBilling();
  const { summary } = billing;
  const addToast = useAppStore((state) => state.addToast);
  const [changePlanOpen, setChangePlanOpen] = useState(false);

  // Replaced in WP-2.7 by the plan-change endpoint (Stripe or a staff-approved request).
  const confirmPlanChange = async (plan: BillingPlan) => {
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    addToast({ title: `Plan change requested: ${plan.toUpperCase()}`, variant: "success" });
  };

  if (billing.isError) {
    return <ErrorState title="Billing could not be loaded" description={apiErrorMessage(billing.error, "The billing service returned an error.")} onRetry={() => void billing.refetch()} />;
  }
  if (!summary) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-4">
      <CurrentPlanCard summary={summary} onChangePlan={() => setChangePlanOpen(true)} />
      <UsageSection summary={summary} onUpgrade={() => setChangePlanOpen(true)} />
      <PlanComparisonTable currentPlan={summary.plan} onUpgradePlan={() => setChangePlanOpen(true)} />
      <FauwardInvoicesTable />
      <PaymentMethodCard summary={summary} />

      <ChangePlanModal
        open={changePlanOpen}
        onOpenChange={setChangePlanOpen}
        currentPlan={summary.plan}
        onConfirm={confirmPlanChange}
      />
    </div>
  );
}
