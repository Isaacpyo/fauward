import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  icon?: ReactNode;
  iconColor?: string;
};

export function StatCard({ label, value, trend, trendUp, icon, iconColor }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 transition hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {trend ? (
            <p className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium", trendUp ? "text-green-600" : "text-red-500")}>
              {trendUp !== undefined ? (
                <svg
                  className={cn("h-3 w-3 shrink-0", trendUp ? "" : "rotate-180")}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
                </svg>
              ) : null}
              {trend}
            </p>
          ) : null}
        </div>
        {icon ? (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconColor ?? "bg-[var(--tenant-primary)]/10 text-[var(--tenant-primary)]")}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}
