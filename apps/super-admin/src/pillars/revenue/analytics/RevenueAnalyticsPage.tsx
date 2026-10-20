import { DegradedBanner } from "@/components/service-kit/DegradedBanner";

export function RevenueAnalyticsPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Revenue</h1>
      <DegradedBanner variant="not-wired" fixedBy="WP-3.2">
        MRR movement, churn and cohort analytics are computed from subscription events in Phase 3. Until then this page shows no figures rather than sample data.
      </DegradedBanner>
    </div>
  );
}
