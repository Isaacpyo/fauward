import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { type PlanOption, featureWords, usePlanChangeState, useRequestPlanChange } from "./plan-change-api";

type ChangePlanModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const planOrder: Record<string, number> = { TRIALING: -1, STARTER: 0, PRO: 1, ENTERPRISE: 2 };

function priceLabel(option: PlanOption, cycle: "MONTHLY" | "ANNUAL") {
  if (!option.price) return "Custom pricing";
  return cycle === "ANNUAL" ? `${option.price.annual} ${option.price.currency} / year` : `${option.price.monthly} ${option.price.currency} / month`;
}

function limitsLabel(option: PlanOption) {
  const shipments = option.features.maxShipmentsPm;
  const staff = option.features.maxStaff;
  return [typeof shipments === "number" ? `${shipments.toLocaleString()} shipments/mo` : null, typeof staff === "number" ? `${staff} staff seats` : null].filter(Boolean).join(" · ");
}

/** Plans and prices come from the API; the change goes to Stripe or to Fauward for approval (WP-2.7). */
export function ChangePlanModal({ open, onOpenChange }: ChangePlanModalProps) {
  const state = usePlanChangeState(open);
  const change = useRequestPlanChange();
  const [selected, setSelected] = useState<string | null>(null);
  const [cycle, setCycle] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const data = state.data;
  const current = data?.currentPlan ?? null;
  const target = data?.plans.find((plan) => plan.plan === selected) ?? null;
  const pending = data?.request && ["PENDING", "CHECKOUT_PENDING"].includes(data.request.status) ? data.request : null;
  const isDowngrade = Boolean(target && current && planOrder[target.plan] < (planOrder[current] ?? 0));

  const setOpen = (next: boolean) => {
    if (!next) {
      change.reset();
      setSelected(null);
    }
    onOpenChange(next);
  };

  const confirm = () => {
    if (!target) return;
    change.mutate(
      { plan: target.plan, billingCycle: cycle },
      {
        onSuccess: (result) => {
          if (result.kind === "CHECKOUT" && result.redirectUrl) window.location.assign(result.redirectUrl);
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} title="Change plan" description="Choose a plan. Changes are applied by Stripe or reviewed by Fauward.">
      <div className="space-y-4">
        {state.isError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{apiErrorMessage(state.error, "Plans could not be loaded.")}</p> : null}
        {state.isLoading ? <p className="text-sm text-gray-500">Loading plans…</p> : null}
        {pending ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="plan-change-pending">
            Your request to move to {featureWords(pending.toPlan.toLowerCase())} is {pending.status === "CHECKOUT_PENDING" ? "waiting for Stripe checkout" : "with Fauward for approval"}. A new request replaces it.
          </p>
        ) : null}
        {data?.request?.status === "REJECTED" && !pending ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="plan-change-rejected">
            Your last request ({featureWords(data.request.toPlan.toLowerCase())}) was not approved{data.request.decisionReason ? `: ${data.request.decisionReason}` : "."}
          </p>
        ) : null}
        {data ? (
          <>
            <div className="flex gap-2 text-sm" role="radiogroup" aria-label="Billing cycle">
              {(["MONTHLY", "ANNUAL"] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={cycle === value} onClick={() => setCycle(value)} className={cn("rounded-md border px-3 py-1", cycle === value ? "border-[var(--tenant-primary)] font-semibold" : "border-gray-200")}>
                  {value === "MONTHLY" ? "Monthly" : "Annual"}
                </button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {data.plans.map((option) => (
                <button
                  key={option.plan}
                  type="button"
                  data-testid="plan-option"
                  onClick={() => setSelected(option.plan)}
                  className={cn("rounded-lg border p-3 text-left", selected === option.plan ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-light)]" : "border-gray-200 bg-white")}
                >
                  <p className="text-sm font-semibold text-gray-900">{featureWords(option.plan.toLowerCase())}</p>
                  <p className="mt-1 text-sm text-gray-700">{priceLabel(option, cycle)}</p>
                  <p className="mt-2 text-xs text-gray-600">{limitsLabel(option)}</p>
                  <p className="mt-1 text-xs text-gray-500">{option.selfServe ? "Changes at once through Stripe" : "Reviewed by Fauward"}</p>
                  {option.plan === current ? <p className="mt-2 text-xs font-semibold text-gray-500">Current plan</p> : null}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {isDowngrade ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Moving to a smaller plan removes the features and limits it does not include.</p>
        ) : null}
        {change.isError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{apiErrorMessage(change.error, "The plan change could not be submitted.")}</p> : null}
        {change.data?.kind === "REQUESTED" ? (
          <p role="status" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Request sent. Fauward will review it and you will be notified of the decision.
          </p>
        ) : null}
        {change.data?.kind === "APPLIED" ? (
          <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Your plan is now {featureWords(change.data.request.toPlan.toLowerCase())}.
          </p>
        ) : null}

        <Button onClick={confirm} loading={change.isPending} disabled={!target || change.isPending || (target.plan === current && cycle === data?.billingCycle)} className="w-full">
          {target ? (target.selfServe ? `Continue with ${featureWords(target.plan.toLowerCase())}` : `Request ${featureWords(target.plan.toLowerCase())}`) : "Choose a plan"}
        </Button>
      </div>
    </Dialog>
  );
}
