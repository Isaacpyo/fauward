import { RevenueCharts } from "@/components/admin/RevenueCharts";

export function RevenueAnalyticsPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Revenue</h1>
      <RevenueCharts />
    </div>
  );
}
