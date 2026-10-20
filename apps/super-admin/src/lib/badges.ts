import { useQuery } from "@tanstack/react-query";

import { consoleApi as api } from "@/lib/console-api";
import type { BadgeKey } from "@/pillars/_manifests";

// Service badges (WP-3.4, architecture §6.4): one GET /badges call returns every key the caller may read. A key the
// caller cannot read is absent and the service shows no badge; a key without data carries the reason.

export type BadgeTone = "neutral" | "green" | "amber" | "red";

export type BadgeValue = {
  value: number | { amount: string; currency: string } | null;
  tone: BadgeTone;
  asOf: string;
  unit?: "ms" | "ratio";
  reason?: string;
};

export type BadgesResponse = Partial<Record<BadgeKey, BadgeValue>>;

export const BADGES_KEY = ["console", "badges"] as const;

export function useBadges() {
  return useQuery({ queryKey: BADGES_KEY, queryFn: async () => (await api.get<BadgesResponse>("/badges")).data, staleTime: 30_000, refetchInterval: 60_000 });
}

/** Formats an API decimal string in the currency the API returned (never assumes GBP). */
export function formatCurrency(amount: string, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount));
}

/** Badge text: counts as numbers, money in its currency, latency in ms, rates as percentages; no data → "no data". */
export function badgeLabel(badge: BadgeValue) {
  const { value } = badge;
  if (value === null) return "no data";
  if (typeof value === "object") return formatCurrency(value.amount, value.currency);
  if (badge.unit === "ms") return `${value} ms`;
  if (badge.unit === "ratio") return `${(value * 100).toFixed(value > 0 && value < 0.01 ? 2 : 1)}%`;
  return value.toLocaleString();
}

export const badgeToneClasses: Record<BadgeTone, string> = {
  neutral: "border-[var(--color-border)] bg-[var(--color-surface-50)] text-[var(--color-text-muted)]",
  green: "border-green-200 bg-green-50 text-green-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700"
};
