import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { apiErrorMessage } from "@/lib/api-error";
import { useNpsEligibility, useNpsPromptEvent, useSendFeedback } from "./feedback-api";

const SCORES = Array.from({ length: 11 }, (_, score) => score);

/**
 * In-app NPS survey (WP-2.8). Shown only when the API says this user is eligible (the daily dispatch job decides);
 * answering or closing it keeps it away for 90 days.
 */
export function NpsPrompt({ enabled }: { enabled: boolean }) {
  const eligibility = useNpsEligibility(enabled);
  const event = useNpsPromptEvent();
  const send = useSendFeedback();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const reported = useRef(false);
  const visible = eligibility.data === true && !send.isSuccess;

  useEffect(() => {
    if (visible && !reported.current) {
      reported.current = true;
      event.mutate("SHOWN");
    }
  }, [visible, event]);

  if (send.isSuccess) {
    return (
      <div role="status" className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
        Thanks for the feedback.
      </div>
    );
  }
  if (!visible) return null;

  return (
    <section aria-label="How likely are you to recommend Fauward?" className="border-b border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">How likely are you to recommend Fauward to a colleague?</p>
        <button type="button" className="text-xs font-semibold underline" onClick={() => event.mutate("DISMISSED")} disabled={event.isPending}>
          Not now
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Score from 0 to 10">
        {SCORES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={score === value}
            onClick={() => setScore(value)}
            className={`h-8 w-8 rounded-md border text-sm ${score === value ? "border-blue-700 bg-blue-700 text-white" : "border-blue-200 bg-white"}`}
          >
            {value}
          </button>
        ))}
      </div>
      {score !== null ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Textarea aria-label="What is the main reason for your score?" value={comment} onChange={(event) => setComment(event.target.value)} rows={2} className="min-w-[16rem] flex-1" />
          <Button size="sm" onClick={() => send.mutate({ type: "NPS", source: "IN_APP_SURVEY", score, ...(comment.trim() ? { body: comment.trim() } : {}) })} loading={send.isPending} disabled={send.isPending}>
            Send
          </Button>
        </div>
      ) : null}
      {send.isError ? <p className="mt-1 text-red-700">{apiErrorMessage(send.error, "Your answer could not be sent.")}</p> : null}
    </section>
  );
}
