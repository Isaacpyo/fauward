import type { BillingPlan } from "@/types/billing";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type PlanComparisonTableProps = {
  currentPlan: BillingPlan;
  onUpgradePlan: (plan: BillingPlan) => void;
};

const rows = [
  { feature: "Shipments / mo", starter: "200", pro: "1000", enterprise: "Unlimited" },
  { feature: "Staff seats", starter: "5", pro: "15", enterprise: "Unlimited" },
  { feature: "API access", starter: "No", pro: "Yes", enterprise: "Yes" },
  { feature: "Webhooks", starter: "No", pro: "Yes", enterprise: "Yes" },
  { feature: "Custom domain", starter: "No", pro: "Yes", enterprise: "Yes" },
  { feature: "White-label tracking", starter: "Basic", pro: "Advanced", enterprise: "Advanced" },
  { feature: "Analytics", starter: "Basic", pro: "Advanced", enterprise: "Advanced" },
  { feature: "Priority support", starter: "No", pro: "No", enterprise: "Yes" },
  { feature: "SSO", starter: "No", pro: "No", enterprise: "Yes" },
  { feature: "SLA", starter: "No", pro: "No", enterprise: "Yes" }
] as const;

const plans: BillingPlan[] = ["starter", "pro", "enterprise"];

export function PlanComparisonTable({
  currentPlan,
  onUpgradePlan
}: PlanComparisonTableProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-base font-semibold text-gray-900">Plan comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <th className="border-b border-gray-200 px-3 py-2 text-left text-xs text-gray-500">Feature</th>
              {plans.map((plan) => (
                <th
                  key={plan}
                  className={cn(
                    "border-b border-gray-200 px-3 py-2 text-left text-xs uppercase",
                    plan === currentPlan ? "bg-[var(--tenant-primary-light)] text-[var(--tenant-primary)]" : "text-gray-500"
                  )}
                >
                  {plan}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.feature} className="border-b border-gray-200 text-sm text-gray-700">
                <td className="px-3 py-2 font-medium text-gray-900">{row.feature}</td>
                <td className="px-3 py-2">{row.starter}</td>
                <td className="px-3 py-2">{row.pro}</td>
                <td className="px-3 py-2">{row.enterprise}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {plans
          .filter((plan) => plan !== currentPlan)
          .map((plan) => (
            <Button key={plan} variant="secondary" size="sm" onClick={() => onUpgradePlan(plan)}>
              Upgrade to {plan}
            </Button>
          ))}
      </div>
    </section>
  );
}
