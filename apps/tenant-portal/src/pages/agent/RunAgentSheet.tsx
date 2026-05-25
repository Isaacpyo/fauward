import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useSweepProgress, type SweepRun, type SweepRunStatus, type SweepStage } from "@/api/agent-run";

const STAGE_ORDER: SweepStage[] = ["queued", "scanning", "flagged", "proposing", "complete"];

type Props = {
  runId: string | null;
  onDone: (run: SweepRun | null) => void;
};

function stageReached(
  current: SweepStage | null,
  target: SweepStage,
  status: SweepRunStatus | null
): "done" | "active" | "pending" {
  // Once the run has finished, every stage row should read as done. Otherwise the final
  // "Complete" row stays on the in-progress spinner because target === current.
  if (status === "COMPLETED") return "done";
  if (!current) return "pending";
  const c = STAGE_ORDER.indexOf(current);
  const t = STAGE_ORDER.indexOf(target);
  if (c === -1 || t === -1) return "pending";
  if (c > t) return "done";
  if (c === t) return "active";
  return "pending";
}

function StageRow({
  label,
  detail,
  state
}: {
  label: string;
  detail: string;
  state: "done" | "active" | "pending";
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full " +
          (state === "done"
            ? "bg-green-100 text-green-600"
            : state === "active"
            ? "bg-amber-100 text-amber-700"
            : "bg-gray-100 text-gray-400")
        }
      >
        {state === "done" ? (
          <Check className="h-3.5 w-3.5" />
        ) : state === "active" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={
            "text-sm " +
            (state === "pending" ? "text-gray-400" : state === "done" ? "text-gray-700" : "text-gray-900 font-medium")
          }
        >
          {label}
        </p>
      </div>
      <p
        className={
          "text-sm tabular-nums " +
          (state === "pending" ? "text-gray-300" : "text-gray-500")
        }
      >
        {detail}
      </p>
    </div>
  );
}

function titleFor(status: SweepRunStatus | null): string {
  if (status === "COMPLETED") return "Run complete";
  if (status === "FAILED") return "Sweep failed";
  return "Running Fauward Agent";
}

function descriptionFor(run: SweepRun | undefined): string {
  if (!run) return "Scanning your shipments and proposing fixes for your approval.";
  if (run.status === "FAILED") return "Something went wrong while running the sweep.";
  if (run.status === "COMPLETED") {
    if (run.flaggedCount === 0) return "All clear — nothing needs attention right now.";
    const noun = run.flaggedCount === 1 ? "thing needs" : "things need";
    return `${run.flaggedCount} ${noun} your attention.`;
  }
  return "Scanning your shipments and proposing fixes for your approval.";
}

export function RunAgentSheet({ runId, onDone }: Props) {
  const { data, error } = useSweepProgress(runId);
  const queryClient = useQueryClient();
  const run: SweepRun | undefined = data;

  const isOpen = runId !== null;
  const status = run?.status ?? null;
  const stage = run?.stage ?? null;
  const isFailed = status === "FAILED";
  const isComplete = status === "COMPLETED";
  const isRunning = isOpen && !isFailed && !isComplete;

  function handleClose(nextRun: SweepRun | null) {
    queryClient.invalidateQueries({ queryKey: ["agent-actions"] });
    queryClient.invalidateQueries({ queryKey: ["agent-actions-summary"] });
    onDone(nextRun);
  }

  function handleOpenChange(open: boolean) {
    if (open) return;
    // Allow Escape / backdrop close at any time. The sweep continues server-side regardless;
    // the 5-min cooldown will catch any accidental immediate re-runs.
    handleClose(run ?? null);
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      title={titleFor(status)}
      description={descriptionFor(run)}
    >
      {error && !run && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">Failed to load run progress.</p>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-50">
        <StageRow
          label="Scanning shipments"
          detail={run ? `${run.scannedCount} checked` : "—"}
          state={stageReached(stage, "scanning", status)}
        />
        <StageRow
          label="Flagging problems"
          detail={run ? `${run.flaggedCount} flagged` : "—"}
          state={stageReached(stage, "flagged", status)}
        />
        <StageRow
          label="Drafting fixes"
          detail={run ? `${run.proposedCount} proposed` : "—"}
          state={stageReached(stage, "proposing", status)}
        />
        <StageRow
          label="Complete"
          detail={run?.finishedAt ? new Date(run.finishedAt).toLocaleTimeString() : ""}
          state={stageReached(stage, "complete", status)}
        />
      </div>

      {isFailed && run?.output && typeof run.output === "object" && "error" in run.output && (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
          <p className="text-xs text-red-700">{String((run.output as { error: unknown }).error)}</p>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {isRunning && (
          <p className="mr-auto inline-flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running in the background — you can close this and come back.
          </p>
        )}
        {isFailed ? (
          <Button variant="secondary" size="sm" onClick={() => handleClose(run ?? null)}>
            Close
          </Button>
        ) : isComplete ? (
          <Button
            size="sm"
            leftIcon={<CheckCircle2 className="h-4 w-4" />}
            onClick={() => handleClose(run ?? null)}
          >
            Continue
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => handleClose(run ?? null)}>
            Close
          </Button>
        )}
      </div>
    </Dialog>
  );
}
