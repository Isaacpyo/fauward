import { AlertTriangle, BarChart3, CheckCircle2, ListChecks, Sparkles } from "lucide-react";

import { useAgentUsage, type AgentUsage } from "@/api/agent-usage";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { UsageMeter } from "@/components/shared/UsageMeter";
import { PageShell } from "@/layouts/PageShell";

function humaniseType(type: string): string {
  const spaced = type.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type Quota = {
  label: string;
  used: number;
  total: number;
};

function pickActiveQuota(usage: AgentUsage): Quota | null {
  if (!usage.limit) return null;
  const { monthlyBudgetUsd, flashRequestLimit, proRequestLimit } = usage.limit;

  if (monthlyBudgetUsd !== null && monthlyBudgetUsd > 0) {
    return {
      label: "Monthly AI budget",
      used: Number(usage.ai.totalCostUsd.toFixed(2)),
      total: Number(monthlyBudgetUsd.toFixed(2))
    };
  }
  if (flashRequestLimit !== null && flashRequestLimit > 0) {
    return { label: "AI requests (flash)", used: usage.ai.totalRequests, total: flashRequestLimit };
  }
  if (proRequestLimit !== null && proRequestLimit > 0) {
    return { label: "AI requests (pro)", used: usage.ai.totalRequests, total: proRequestLimit };
  }
  return null;
}

export function AgentUsagePage() {
  const { data, isLoading, error, refetch } = useAgentUsage();

  return (
    <PageShell
      title="Usage"
      description="AI consumption and plan limits for Fauward Agent this month."
    >
      {isLoading && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">Failed to load usage data.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !error && data && <UsageContent usage={data} />}
    </PageShell>
  );
}

function UsageContent({ usage }: { usage: AgentUsage }) {
  const quota = pickActiveQuota(usage);
  const autoPctLabel = usage.actions.autoHandledPct === null ? "—" : `${usage.actions.autoHandledPct}%`;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Tasks this month"
          value={usage.actions.total}
          icon={<ListChecks className="h-5 w-5" />}
        />
        <StatCard
          label="% auto-handled"
          value={autoPctLabel}
          icon={<Sparkles className="h-5 w-5" />}
        />
        <StatCard
          label="You approved"
          value={usage.actions.approved}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900">Plan limit</h3>
        <p className="mt-1 text-xs text-gray-500">
          Usage for {usage.month}. Each LLM call inside a sweep counts toward this limit.
        </p>
        <div className="mt-4">
          {quota ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">{quota.label}</p>
              <UsageMeter used={quota.used} total={quota.total} />
            </div>
          ) : (
            <p className="text-sm text-gray-500">No limit on your plan.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">What the agent worked on</h3>
        </div>
        {usage.actions.byType.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No agent activity yet this month.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {usage.actions.byType.map((row) => (
              <li key={row.type} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{humaniseType(row.type)}</span>
                <span className="font-medium tabular-nums text-gray-900">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
