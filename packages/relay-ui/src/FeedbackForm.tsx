"use client";

import { FormEvent, useState } from "react";

import { submitFeedback } from "./client";

const ratingOptions = [
  { value: 5, label: "Very satisfied" },
  { value: 4, label: "Satisfied" },
  { value: 3, label: "Neutral" },
  { value: 2, label: "Unsatisfied" },
  { value: 1, label: "Not satisfied" },
];

export function FeedbackForm({
  conversationId,
  submittedBy,
  tenantId,
  accessToken,
  compact = false,
  onSubmitted,
}: {
  conversationId: string;
  submittedBy?: string;
  tenantId?: string;
  accessToken?: string;
  compact?: boolean;
  onSubmitted?: () => void;
}) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(`fw_relay_feedback_${conversationId}`) === "sent";
  });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      await submitFeedback({
        conversation_id: conversationId,
        rating,
        comment: comment.trim() || undefined,
        submitted_by: submittedBy,
        tenant_id: tenantId,
        access_token: accessToken,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`fw_relay_feedback_${conversationId}`, "sent");
      }
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit feedback";
      setError(message.includes("duplicate") ? "Feedback has already been submitted." : message);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        Thanks for your feedback.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-gray-200 bg-white p-3">
      <p className="text-sm font-semibold text-gray-900">How was this support chat?</p>
      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-5"}`}>
        {ratingOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRating(option.value)}
            className={`rounded-md border px-2 py-2 text-xs font-medium transition ${
              rating === option.value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={compact ? 2 : 3}
        placeholder="Optional comment"
        className="mt-3 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
      />
      {error ? <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={sending}
        className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Submitting..." : "Submit feedback"}
      </button>
    </form>
  );
}
