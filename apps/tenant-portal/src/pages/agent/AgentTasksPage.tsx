import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Play, XCircle } from "lucide-react";

import {
  useAgentActions,
  useAgentActionSummary,
  useApproveAgentAction,
  useRejectAgentAction,
  type AgentAction,
  type AgentActionStatusFilter
} from "@/api/agent-actions";
import { useStartSweep, type StartSweepError, type SweepRun } from "@/api/agent-run";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
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
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${item.tone}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// Status → tab mapping. Kept in sync with the summary endpoint.
//   needs_you (PENDING_APPROVAL): risky proposals waiting for human approval.
//   flagged   (AUTO_APPLIED):     flag_finding rows from sweeps + auto-approved tool calls.
//   done      (APPLIED):          human-approved actions that executed successfully.
//   rejected  (REJECTED):         actions the human rejected or policy blocked.
//   all       (no filter):        everything (incl. FAILED).
type TabKey = "needs_you" | "flagged" | "done" | "rejected" | "all";

const TAB_FILTER: Record<TabKey, AgentActionStatusFilter> = {
  needs_you: "PENDING_APPROVAL",
  flagged: "AUTO_APPLIED",
  done: "APPLIED",
  rejected: "REJECTED",
  all: undefined
};

const TAB_EMPTY_COPY: Record<TabKey, { title: string; description: string }> = {
  needs_you: {
    title: "You're all caught up",
    description: "Fauward Agent will flag anything that needs your decision here — failed deliveries, risky reroutes, customer notifications."
  },
  flagged: {
    title: "Nothing flagged",
    description: "Run the agent to scan your shipments and surface anything worth a look."
  },
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
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("needs_you");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [startError, setStartError] = useState<StartSweepError | null>(null);
  const filter = TAB_FILTER[activeTab];

  const { data, isLoading, error, refetch } = useAgentActions(filter, 1, 50);
  const summary = useAgentActionSummary();
  const approve = useApproveAgentAction();
  const reject = useRejectAgentAction();
  const startSweep = useStartSweep();

  const actions = data?.items ?? [];
  const showActionButtons = activeTab === "needs_you";

  const tabItems = useMemo(() => {
    const needsYouCount = summary.data?.needsYou ?? 0;
    const flaggedCount = summary.data?.flagged ?? 0;
    return [
      { value: "needs_you", label: needsYouCount > 0 ? `Needs you (${needsYouCount})` : "Needs you" },
      { value: "flagged", label: flaggedCount > 0 ? `Flagged (${flaggedCount})` : "Flagged" },
      { value: "done", label: "Done" },
      { value: "rejected", label: "Rejected" },
      { value: "all", label: "All" }
    ];
  }, [summary.data]);

  async function handleApprove(id: string) {
    setConfirmId(null);
    await approve.mutateAsync(id);
  }

  async function handleReject(id: string) {
    await reject.mutateAsync(id);
  }

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
      <div className="space-y-5">
        <SummaryStrip summary={summary.data} loading={summary.isLoading} />

        {startError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {startError.message}
          </div>
        )}

        <RunAgentSheet
          runId={activeRunId}
          onDone={(run) => {
            setActiveRunId(null);
            if (run) {
              // Pending proposals are the urgent stack; otherwise show what the sweep flagged.
              const hasPending = run.proposedCount > run.flaggedCount;
              if (hasPending) {
                setActiveTab("needs_you");
              } else if (run.flaggedCount > 0) {
                setActiveTab("flagged");
              }
            }
          }}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} items={tabItems}>
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
                title={TAB_EMPTY_COPY[activeTab].title}
                description={TAB_EMPTY_COPY[activeTab].description}
              />
            )}

            {!isLoading && actions.length > 0 && (
              <div className="space-y-3">
                {actions.map((action) => {
                  const ToolIcon = actionIcon(action);
                  const approving = approve.isPending && confirmId === action.id;
                  return (
                    <div
                      key={action.id}
                      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
                            <ToolIcon size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-900">{actionTitle(action)}</h3>
                              <StatusBadge status={action.status} />
                            </div>
                            <p className="mt-1.5 text-sm text-gray-600">{actionSummary(action)}</p>
                            <p className="mt-2 text-xs text-gray-400">
                              Proposed {new Date(action.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {showActionButtons && (
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReject(action.id)}
                              disabled={reject.isPending || approve.isPending}
                              loading={reject.isPending}
                              leftIcon={<XCircle className="h-4 w-4" />}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setConfirmId(action.id)}
                              disabled={approve.isPending || reject.isPending}
                              loading={approving}
                              leftIcon={<CheckCircle2 className="h-4 w-4" />}
                            >
                              Approve
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Tabs>
      </div>

      <Dialog
        open={Boolean(confirmId)}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="Approve this action?"
        description="This will execute the agent's proposed action immediately. It cannot be undone."
      >
        <div className="py-2">
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmId && handleApprove(confirmId)}
              disabled={approve.isPending}
              loading={approve.isPending}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Approve
            </Button>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}
