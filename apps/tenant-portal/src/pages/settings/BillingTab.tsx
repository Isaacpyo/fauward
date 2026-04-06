import { useState } from "react";

import { ChangePlanModal } from "@/components/billing/ChangePlanModal";
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard";
import { InvoiceHistoryTable } from "@/components/billing/InvoiceHistoryTable";
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard";
import { PlanComparisonTable } from "@/components/billing/PlanComparisonTable";
import { UsageSection } from "@/components/billing/UsageSection";
import { useBilling } from "@/hooks/useBilling";
import type { BillingPlan } from "@/types/billing";
import { useAppStore } from "@/stores/useAppStore";

export function BillingTab() {
  const { summary } = useBilling();
  const addToast = useAppStore((state) => state.addToast);
  const [changePlanOpen, setChangePlanOpen] = useState(false);

  const manageBilling = () => {
    window.open("https://billing.stripe.com/session", "_blank", "noopener,noreferrer");
  };

  const confirmPlanChange = async (plan: BillingPlan) => {
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    addToast({ title: `Plan change requested: ${plan.toUpperCase()}`, variant: "success" });
  };

  return (
    <div className="space-y-4">
      <CurrentPlanCard
        summary={summary}
        onChangePlan={() => setChangePlanOpen(true)}
        onManageBilling={manageBilling}
      />
      <UsageSection summary={summary} onUpgrade={() => setChangePlanOpen(true)} />
      <PlanComparisonTable currentPlan={summary.plan} onUpgradePlan={() => setChangePlanOpen(true)} />
      <InvoiceHistoryTable summary={summary} />
      <PaymentMethodCard summary={summary} onManageBilling={manageBilling} />

      <ChangePlanModal
        open={changePlanOpen}
        onOpenChange={setChangePlanOpen}
        currentPlan={summary.plan}
        onConfirm={confirmPlanChange}
      />
    </div>
  );
}
