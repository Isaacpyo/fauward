import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import {
  useApproveAgentAction,
  useRejectAgentAction,
  type AgentAction
} from "@/api/agent-actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { verbsForAction, type ActionVerbSet } from "./agent-actions.rules";

export type ActionConfirmKind = "approve" | "reject";

type Props = {
  action: AgentAction | null;
  kind: ActionConfirmKind;
  open: boolean;
  onClose: () => void;
};

type Step = "confirm" | "working" | "success" | "failure";

const FALLBACK_BY_KIND: Record<ActionConfirmKind, ActionVerbSet> = {
  approve: {
    label: "Approve",
    heading: "Approve this action?",
    workingLabel: "Applying…",
    successLabel: "Done"
  },
  reject: {
    label: "Reject",
    heading: "Reject this suggestion?",
    workingLabel: "Rejecting…",
    successLabel: "Rejected"
  }
};

const CONFIRM_BODY: Record<ActionConfirmKind, string> = {
  approve: "This will execute the agent's proposed action immediately. It cannot be undone.",
  reject: "The agent won't act on this. You can run the sweep again later if you change your mind."
};

const FAILURE_TITLE: Record<ActionConfirmKind, string> = {
  approve: "Couldn't complete",
  reject: "Couldn't reject"
};

const FAILURE_BODY = "Couldn't complete — please try again.";

export function ActionConfirmDialog({ action, kind, open, onClose }: Props) {
  // Both hooks are called unconditionally to satisfy React's rules; pick the active one.
  const approve = useApproveAgentAction();
  const reject = useRejectAgentAction();
  const mutation = kind === "approve" ? approve : reject;
  const copy: ActionVerbSet = action ? verbsForAction(action)[kind] : FALLBACK_BY_KIND[kind];

  // Step is derived from the mutation's real lifecycle — no useState, so the dialog body
  // never gets out of sync with the server work that's actually happening.
  const step: Step = mutation.isPending
    ? "working"
    : mutation.isSuccess
    ? "success"
    : mutation.isError
    ? "failure"
    : "confirm";

  // Reset the mutation when the dialog opens. Without this a prior session's success or
  // failure would leak into the next open and skip the confirm step entirely.
  useEffect(() => {
    if (open) {
      mutation.reset();
    }
    // We only care about the open→true transition; mutation.reset is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit() {
    if (!action) return;
    mutation.mutate(action.id);
  }

  function handleOpenChange(next: boolean) {
    if (next) return;
    // Block close during the working state — the action is genuinely in flight on the
    // server. Escape and backdrop click are both no-ops until it finishes.
    if (step === "working") return;
    onClose();
  }

  // Title is per-action for confirm + working (operators want to see *what* is happening),
  // but kind-generic for success + failure so the title doesn't duplicate the body's
  // per-action message ("Driver assigned" / etc.) right below it.
  const title =
    step === "confirm"
      ? copy.heading
      : step === "working"
      ? copy.workingLabel
      : step === "success"
      ? "Done"
      : FAILURE_TITLE[kind];

  const description = step === "confirm" ? CONFIRM_BODY[kind] : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title={title} description={description}>
      {step === "confirm" && (
        <div key="confirm" className="animate-fauward-fade-in">
          <div className="flex justify-end gap-3 py-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant={kind === "reject" ? "danger" : "primary"}
              leftIcon={
                kind === "approve" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )
              }
            >
              {copy.label}
            </Button>
          </div>
        </div>
      )}

      {step === "working" && (
        <div key="working" className="animate-fauward-fade-in py-6 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-amber-500" />
          <p className="mt-3 text-sm text-gray-600">Hang tight — finishing up…</p>
        </div>
      )}

      {step === "success" && (
        <div key="success" className="animate-fauward-fade-in py-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 animate-fauward-pop-in">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="mt-3 text-sm font-medium text-gray-900">{copy.successLabel}</p>
          <div className="mt-5 flex justify-center">
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}

      {step === "failure" && (
        <div key="failure" className="animate-fauward-fade-in py-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 animate-fauward-pop-in">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <p className="mt-3 text-sm font-medium text-gray-900">{FAILURE_BODY}</p>
          {mutation.error instanceof Error && mutation.error.message ? (
            <p className="mt-1 text-xs text-gray-500">{mutation.error.message}</p>
          ) : null}
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" onClick={handleSubmit}>
              Try again
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
