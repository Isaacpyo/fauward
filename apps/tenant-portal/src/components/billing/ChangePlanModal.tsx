import { useState } from "react";

import type { BillingPlan } from "@/types/billing";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

type ChangePlanModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: BillingPlan;
  onConfirm: (plan: BillingPlan) => Promise<void>;
};

const planOrder: Record<BillingPlan, number> = {
  starter: 0,
  pro: 1,
  enterprise: 2
};

const planInfo: Record<BillingPlan, { price: string; features: string[] }> = {
  starter: {
    price: "£29/mo",
    features: ["200 shipments/mo", "5 staff seats", "Basic tracking"]
  },
  pro: {
    price: "£79/mo",
    features: ["1000 shipments/mo", "15 staff seats", "API + webhooks"]
  },
  enterprise: {
    price: "Custom",
    features: ["Unlimited usage", "SSO", "SLA + priority support"]
  }
};

export function ChangePlanModal({
  open,
  onOpenChange,
  currentPlan,
  onConfirm
}: ChangePlanModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>(currentPlan);
  const [submitting, setSubmitting] = useState(false);
  const isUpgrade = planOrder[selectedPlan] > planOrder[currentPlan];
  const isDowngrade = planOrder[selectedPlan] < planOrder[currentPlan];

  const confirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(selectedPlan);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change plan"
      description="Select a plan and confirm changes."
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(planInfo) as BillingPlan[]).map((plan) => (
            <button
              key={plan}
              type="button"
              onClick={() => setSelectedPlan(plan)}
              className={cn(
                "rounded-lg border p-3 text-left",
                selectedPlan === plan
                  ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-light)]"
                  : "border-gray-200 bg-white"
              )}
            >
              <p className="text-sm font-semibold text-gray-900">{plan.toUpperCase()}</p>
              <p className="mt-1 text-sm text-gray-700">{planInfo[plan].price}</p>
              <ul className="mt-2 space-y-1 text-xs text-gray-600">
                {planInfo[plan].features.map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
              {plan === currentPlan ? <p className="mt-2 text-xs font-semibold text-gray-500">Current plan</p> : null}
            </button>
          ))}
        </div>

        {isUpgrade ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            You'll be charged the prorated difference immediately.
          </p>
        ) : null}
        {isDowngrade ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Downgrade takes effect at end of current billing period. You may lose access to API/webhooks/custom domain.
          </p>
        ) : null}

        <Button onClick={confirm} loading={submitting} disabled={submitting || selectedPlan === currentPlan} className="w-full">
          Confirm {selectedPlan.toUpperCase()}
        </Button>
      </div>
    </Dialog>
  );
}
