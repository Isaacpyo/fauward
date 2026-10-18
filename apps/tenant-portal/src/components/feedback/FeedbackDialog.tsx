import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { apiErrorMessage } from "@/lib/api-error";
import { type FeedbackSource, type FeedbackType, useSendFeedback } from "./feedback-api";

type FeedbackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: Exclude<FeedbackType, "NPS">;
  source: FeedbackSource;
  /** Set when raised from a PlanGate: the locked feature the request is about. */
  featureKey?: string;
  featureLabel?: string;
};

const TYPE_LABELS: Record<Exclude<FeedbackType, "NPS">, string> = { FEATURE_REQUEST: "Request a feature", BUG: "Report a problem", GENERAL: "General feedback" };

/** Sends feedback or a feature request to Fauward; the reply and status show under Help → Feedback. */
export function FeedbackDialog({ open, onOpenChange, initialType = "GENERAL", source, featureKey, featureLabel }: FeedbackDialogProps) {
  const send = useSendFeedback();
  const [type, setType] = useState<Exclude<FeedbackType, "NPS">>(initialType);
  const [title, setTitle] = useState(featureLabel ? `Access to ${featureLabel}` : "");
  const [body, setBody] = useState("");

  const setOpen = (next: boolean) => {
    if (!next) {
      send.reset();
      setType(initialType);
      setTitle(featureLabel ? `Access to ${featureLabel}` : "");
      setBody("");
    }
    onOpenChange(next);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send.mutate({ type, source, title: title.trim(), ...(body.trim() ? { body: body.trim() } : {}), ...(featureKey ? { featureKey } : {}) });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} title={TYPE_LABELS[type]} description="Fauward reads every message; you will see its status and replies under Help → Feedback.">
      {send.data ? (
        <div className="space-y-3">
          <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Thanks — Fauward has your {type === "FEATURE_REQUEST" ? "request" : "feedback"}. You will be notified when its status changes.
          </p>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          {!featureKey ? (
            <label className="block text-sm font-medium text-gray-700">
              Type
              <select aria-label="Feedback type" className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as Exclude<FeedbackType, "NPS">)}>
                {(Object.keys(TYPE_LABELS) as Array<Exclude<FeedbackType, "NPS">>).map((value) => (
                  <option key={value} value={value}>
                    {TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-gray-700">
              Feature: <span className="font-semibold">{featureLabel ?? featureKey}</span>
            </p>
          )}
          <Input aria-label="Title" placeholder="Short summary" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} maxLength={200} />
          <Textarea aria-label="Details" placeholder="What do you need, and why?" value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
          {send.isError ? <p className="text-sm text-red-700">{apiErrorMessage(send.error, "Your feedback could not be sent.")}</p> : null}
          <Button type="submit" loading={send.isPending} disabled={send.isPending || title.trim().length < 3}>
            Send
          </Button>
        </form>
      )}
    </Dialog>
  );
}
