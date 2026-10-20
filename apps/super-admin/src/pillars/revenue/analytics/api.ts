import { useQuery } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// revenue.analytics (WP-3.2): every response says since when data exists and before when it is reconstructed (0051
// backfill), so the charts can mark those months.

export type Coverage = { dataSince: string | null; reconstructedBefore: string | null; baseCurrency: string; unconvertedEvents: number };

export type MovementRow = { month: string; new: string; expansion: string; contraction: string; churn: string; reactivation: string; net: string; reconstructed: boolean };
export type CohortMonth = { month: string; offset: number; payingTenants: number; logoRetention: number | null; mrr: string; revenueRetention: number | null };
export type CohortRow = { cohort: string; signups: number; paying: number; startingMrr: string; months: CohortMonth[] };
export type PlanRow = { plan: string; billingCycle: string; tenants: number; mrr: string; unconverted: number };
export type Forecast = Coverage & {
  label: "projection";
  method: string;
  currency: string;
  basis: { months: Array<{ month: string; net: string }>; averageNet: string; startingMrr: string };
  points: Array<{ month: string; mrr: string }>;
};

export const ANALYTICS_KEY = ["revenue.analytics"] as const;

export function useMovement(range: { from: string; to: string }) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "movement", range],
    queryFn: async () => (await consoleApi.get<Coverage & { from: string; to: string; data: MovementRow[] }>("/revenue/analytics/mrr-movement", { params: range })).data
  });
}

export function useCohorts(range: { from: string; to: string }) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "cohorts", range],
    queryFn: async () => (await consoleApi.get<Coverage & { data: CohortRow[] }>("/revenue/analytics/cohorts", { params: { ...range, by: "signup_month" } })).data
  });
}

export function useByPlan() {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "by-plan"],
    queryFn: async () => (await consoleApi.get<Coverage & { rows: PlanRow[]; total: string; currency: string; asOf: string }>("/revenue/analytics/by-plan")).data
  });
}

export function useForecast(months: number) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "forecast", months],
    queryFn: async () => (await consoleApi.get<Forecast>("/revenue/analytics/forecast", { params: { months } })).data
  });
}

/** Months in the window that fall before live tracking began (rebuilt from the backfill). */
export function isReconstructed(month: string, coverage: Pick<Coverage, "reconstructedBefore">) {
  return coverage.reconstructedBefore !== null && month < coverage.reconstructedBefore.slice(0, 7);
}
