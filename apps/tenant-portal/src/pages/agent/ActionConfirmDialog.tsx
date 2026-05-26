import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import {
  useApproveAgentAction,
  useRejectAgentAction,
  type AgentAction
} from "@/api/agent-actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export type ActionConfirmKind = "approve" | "reject";

type Props = {
  action: AgentAction | null;
  kind: ActionConfirmKind;
  open: boolean;
  onClose: () => void;
};

type Step = "confirm" | "working" | "success" | "failure";

const COPY: Record<
  ActionConfirmKind,
  {
    confirmTitle: string;
    confirmBody: string;
    confirmCta: string;
    workingTitle: string;
    workingBody: string;
    successTitle: string;
    failureTitle: string;
    failureBody: string;
  }
> = {
  approve: {
    confirmTitle: "Approve this action?",
    confirmBody:
      "This will execute the agent's proposed action immediately. It cannot be undone.",
    confirmCta: "Approve",
    workingTitle: "Applying…",
    workingBody: "Executing the agent's action.",
    successTitle: "Done",
    failureTitle: "Couldn't approve",
    failureBody: "Couldn't complete this action — please try again."
  },
  reject: {
    confirmTitle: "Reject this suggestion?",
    confirmBody:
      "The agent won't act on this. You can run the sweep again later if you change your mind.",
    confirmCta: "Reject",
    workingTitle: "Rejecting…",
    workingBody: "Rejecting the suggestion.",
    successTitle: "Done",
    failureTitle: "Couldn't reject",
    failureBody: "Couldn't reject this — please try again."
  }
};

const SUCCESS_BY_TYPE: Record<string, string> = {
  assign_shipment: "Driver assigned",
  reroute_shipment: "Shipment rerouted",
  send_customer_notification: "Customer notified",
  flag_sla_risk: "Risk flagged"
};

function successMessage(action: AgentAction | null, kind: ActionConfirmKind): string {
  if (kind === "reject") return "Rejected";
  if (action && SUCCESS_BY_TYPE[action.type]) return SUCCESS_BY_TYPE[action.type];
  return "Action completed";
}

export function ActionConfirmDialog({ action, kind, open, onClose }: Props) {
  // Both hooks are called unconditionally to satisfy React's rules; pick the active one.
  const approve = useApproveAgentAction();
  const reject = useRejectAgentAction();
  const mutation = kind === "approve" ? approve : reject;
  const copy = COPY[kind];

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

  const title =
    step === "confirm"
      ? copy.confirmTitle
      : step === "working"
      ? copy.workingTitle
      : step === "success"
      ? copy.successTitle
      : copy.failureTitle;

  const description = step === "confirm" ? copy.confirmBody : undefined;

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
              {copy.confirmCta}
            </Button>
          </div>
        </div>
      )}

      {step === "working" && (
        <div key="working" className="animate-fauward-fade-in py-6 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-amber-500" />
          <p className="mt-3 text-sm text-gray-600">{copy.workingBody}</p>
        </div>
      )}

      {step === "success" && (
        <div key="success" className="animate-fauward-fade-in py-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 animate-fauward-pop-in">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="mt-3 text-sm font-medium text-gray-900">
            {successMessage(action, kind)}
          </p>
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
          <p className="mt-3 text-sm font-medium text-gray-900">{copy.failureBody}</p>
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
