import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Play, XCircle } from "lucide-react";

import {
  useAgentActions,
  useAgentActionSummary,
  type AgentAction,
  type AgentActionStatusFilter
} from "@/api/agent-actions";
import { useAgentCoverage, type CoverageGroup } from "@/api/agent-coverage";
import { useStartSweep, type StartSweepError } from "@/api/agent-run";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
import { ActionConfirmDialog, type ActionConfirmKind } from "./ActionConfirmDialog";
import { classifyAction, verbsForAction } from "./agent-actions.rules";
import { actionIcon, actionSummary, actionTitle } from "./agent-tasks.format";
import { RunAgentSheet } from "./RunAgentSheet";

const STATUS_CONFIG: Record<
  AgentAction["status"],
  { variant: "warning" | "success" | "error" | "neutral"; icon: React.ElementType; label: string }
> = {
  PENDING_APPROVAL: { variant: "warning", icon: Clock, label: "Pending" },
  AUTO_APPLIED: { variant: "success", icon: CheckCircle2, label: "Auto-applied" },
  APPLIED: { variant: "success", icon: CheckCircle2, label: "Applied" },
  REJECTED: { variant: "error", icon: XCircle, label: "Rejected" },
  FAILED: { variant: "error", icon: AlertTriangle, label: "Failed" }
};

function StatusBadge({ status }: { status: AgentAction["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? { variant: "neutral" as const, icon: Clock, label: status };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <Icon size={12} />
      {cfg.label}
    </Badge>
  );
}

function SummaryStrip({
  summary,
  loading
}: {
  summary: { needsYou: number; doneToday: number; failed: number } | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-14 w-full rounded-xl" />;
  }
  const items: Array<{ label: string; value: number; tone: string }> = [
    { label: "Needs you", value: summary?.needsYou ?? 0, tone: "text-amber-700" },
    { label: "Done today", value: summary?.doneToday ?? 0, tone: "text-green-700" },
    { label: "Failed", value: summary?.failed ?? 0, tone: "text-red-700" }
  ];
  return (
    <div className="grid grid-cols-3 gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      {items.map((item) => (
        <div key={item.label} className="text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{item.label}</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${item.tone}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

type ActionCardProps = {
  action: AgentAction;
  showActions: boolean;
  onApprove: () => void;
  onReject: () => void;
};

export function ActionCard({ action, showActions, onApprove, onReject }: ActionCardProps) {
  const ToolIcon = actionIcon(action);
  const verbs = verbsForAction(action);
  // The Coverage `actionable` flag from /v1/agent/coverage gates `showActions` per group.
  // The client classifier composes strictly on top: even if the server marks a group
  // actionable, an informational row inside it gets buttons suppressed. Intentional.
  const isInformational = classifyAction(action) === "informational";
  const canAct = showActions && !isInformational && action.status === "PENDING_APPROVAL";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
            <ToolIcon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-gray-900">{actionTitle(action)}</h3>
              <StatusBadge status={action.status} />
              {isInformational && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                  FYI
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-600">{actionSummary(action)}</p>
            <p className="mt-1.5 text-xs text-gray-400">
              Proposed {new Date(action.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        {canAct && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              leftIcon={<XCircle className="h-4 w-4" />}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {verbs.reject.label}
            </Button>
            <Button
              size="sm"
              onClick={onApprove}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              {verbs.approve.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Tabs: Coverage is the live workspace; the rest are archival lenses on history.
//   coverage  → grouped sections (problems-first) + on-track summary  (via useAgentCoverage)
//   done      → APPLIED  (human-approved + executed)
//   rejected  → REJECTED
//   all       → no filter (incl. AUTO_APPLIED + FAILED)
type TabKey = "coverage" | "done" | "rejected" | "all";

const ARCHIVAL_FILTER: Record<Exclude<TabKey, "coverage">, AgentActionStatusFilter> = {
  done: "APPLIED",
  rejected: "REJECTED",
  all: undefined
};

const ARCHIVAL_EMPTY_COPY: Record<Exclude<TabKey, "coverage">, { title: string; description: string }> = {
  done: {
    title: "Nothing handled yet",
    description: "Actions you approve and that run successfully land here."
  },
  rejected: {
    title: "Nothing rejected",
    description: "Actions you reject will be listed here."
  },
  all: {
    title: "Nothing here yet",
    description: "Once Fauward Agent proposes its first action, it will show up here."
  }
};

export function AgentTasksPage() {
  const [pending, setPending] = useState<{ action: AgentAction; kind: ActionConfirmKind } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("coverage");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [startError, setStartError] = useState<StartSweepError | null>(null);

  const summary = useAgentActionSummary();
  const startSweep = useStartSweep();

  const tabItems = useMemo(() => {
    const needsYouCount = summary.data?.needsYou ?? 0;
    return [
      { value: "coverage", label: needsYouCount > 0 ? `Coverage (${needsYouCount})` : "Coverage" },
      { value: "done", label: "Done" },
      { value: "rejected", label: "Rejected" },
      { value: "all", label: "All" }
    ];
  }, [summary.data]);

  function handleRunAgent() {
    setStartError(null);
    startSweep.mutate(undefined, {
      onSuccess: ({ runId }) => {
        setActiveRunId(runId);
      },
      onError: (err) => {
        setStartError(err);
      }
    });
  }

  const sweepRunning = Boolean(activeRunId);
  const buttonDisabled = startSweep.isPending || sweepRunning;
  const buttonLabel = startSweep.isPending ? "Starting…" : sweepRunning ? "Running…" : "Run agent";

  const renderCard = (action: AgentAction, withButtons: boolean) => (
    <ActionCard
      key={action.id}
      action={action}
      showActions={withButtons && action.status === "PENDING_APPROVAL"}
      onApprove={() => setPending({ action, kind: "approve" })}
      onReject={() => setPending({ action, kind: "reject" })}
    />
  );

  return (
    <PageShell
      title="Tasks"
      description="Fauward Agent watches for failed deliveries and runs checks on demand. Anything risky lands here for your approval."
      actions={
        <Button
          leftIcon={<Play className="h-4 w-4" />}
          onClick={handleRunAgent}
          disabled={buttonDisabled}
          loading={startSweep.isPending}
        >
          {buttonLabel}
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <SummaryStrip summary={summary.data} loading={summary.isLoading} />

        {startError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {startError.message}
          </div>
        )}

        <RunAgentSheet
          runId={activeRunId}
          onDone={() => {
            setActiveRunId(null);
            // Coverage is the default; it auto-refetches via the mutation invalidation.
            setActiveTab("coverage");
          }}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} items={tabItems}>
          {activeTab === "coverage" ? (
            <CoveragePanel renderCard={renderCard} />
          ) : (
            <ArchivalPanel tabKey={activeTab} renderCard={renderCard} />
          )}
        </Tabs>
      </div>

      <ActionConfirmDialog
        action={pending?.action ?? null}
        kind={pending?.kind ?? "approve"}
        open={pending !== null}
        onClose={() => setPending(null)}
      />
    </PageShell>
  );
}

function CoveragePanel({ renderCard }: { renderCard: (a: AgentAction, withButtons: boolean) => React.ReactNode }) {
  const { data, isLoading, error, refetch } = useAgentCoverage();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">Failed to load coverage.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasNeverRun = data.lastRunAt === null && data.groups.length === 0 && data.onTrack === 0;
  if (hasNeverRun) {
    return (
      <EmptyState
        icon={Play}
        title="Run the agent to scan your shipments"
        description="The agent groups problems by kind so the few that need your attention float above hundreds of healthy shipments."
      />
    );
  }

  return (
    <div className="space-y-5">
      {data.groups.map((group) => (
        <CoverageGroupSection key={group.kind} group={group} renderCard={renderCard} />
      ))}
      <OnTrackSummary count={data.onTrack} />
    </div>
  );
}

function CoverageGroupSection({
  group,
  renderCard
}: {
  group: CoverageGroup;
  renderCard: (a: AgentAction, withButtons: boolean) => React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          {group.label}{" "}
          <span className="text-xs font-normal text-gray-500">({group.items.length})</span>
        </h2>
        {group.actionable && (
          <Badge variant="warning" className="text-[10px] uppercase tracking-wide">
            Needs you
          </Badge>
        )}
      </header>
      <div className="space-y-2.5">
        {group.items.map((action) => renderCard(action, group.actionable))}
      </div>
    </section>
  );
}

function OnTrackSummary({ count }: { count: number }) {
  if (count <= 0) return null;
  const noun = count === 1 ? "shipment" : "shipments";
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-3 text-center">
      <p className="text-sm text-gray-600">
        <span className="font-semibold tabular-nums text-gray-900">{count.toLocaleString()}</span>{" "}
        {noun} on track — no action needed
      </p>
    </div>
  );
}

function ArchivalPanel({
  tabKey,
  renderCard
}: {
  tabKey: Exclude<TabKey, "coverage">;
  renderCard: (a: AgentAction, withButtons: boolean) => React.ReactNode;
}) {
  const { data, isLoading, error, refetch } = useAgentActions(ARCHIVAL_FILTER[tabKey], 1, 50);
  const actions = data?.items ?? [];

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">Failed to load tasks.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !error && actions.length === 0 && (
        <EmptyState
          icon={CheckCircle2}
          title={ARCHIVAL_EMPTY_COPY[tabKey].title}
          description={ARCHIVAL_EMPTY_COPY[tabKey].description}
        />
      )}

      {!isLoading && actions.length > 0 && (
        <div className="space-y-3">{actions.map((action) => renderCard(action, false))}</div>
      )}
    </div>
  );
}
