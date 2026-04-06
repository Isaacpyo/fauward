import { UsageMeter } from "@/components/billing/UsageMeter";
import type { BillingSummary } from "@/types/billing";

type UsageSectionProps = {
  summary: BillingSummary;
  onUpgrade: () => void;
};

export function UsageSection({ summary, onUpgrade }: UsageSectionProps) {
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="text-base font-semibold text-gray-900">Usage</h3>
      <UsageMeter
        label="Shipments this month"
        used={summary.usage.shipments.used}
        limit={summary.usage.shipments.limit}
        onUpgrade={onUpgrade}
      />
      <UsageMeter
        label="Staff seats"
        used={summary.usage.staff.used}
        limit={summary.usage.staff.limit}
        onUpgrade={onUpgrade}
      />
      <UsageMeter
        label="API calls"
        used={summary.usage.apiCalls.used}
        limit={summary.usage.apiCalls.limit}
        onUpgrade={onUpgrade}
      />
    </section>
  );
}
