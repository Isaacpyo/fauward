import { useState } from "react";

import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { statusWords, useMyFeedback } from "@/components/feedback/feedback-api";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageShell } from "@/layouts/PageShell";
import { Button } from "@/components/ui/Button";
import { apiErrorMessage } from "@/lib/api-error";

/** Help → Feedback (WP-2.8): send feedback or request a feature, and follow what Fauward did with it. */
export function MyFeedbackPage() {
  const items = useMyFeedback();
  const [dialog, setDialog] = useState<"GENERAL" | "FEATURE_REQUEST" | null>(null);

  return (
    <PageShell title="Feedback" description="Ideas, feature requests and problems you have sent to Fauward, with their status and replies.">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setDialog("FEATURE_REQUEST")}>Request a feature</Button>
        <Button variant="secondary" onClick={() => setDialog("GENERAL")}>
          Send feedback
        </Button>
      </div>
      {items.isError ? <ErrorState title="Your feedback could not be loaded" description={apiErrorMessage(items.error, "The feedback service returned an error.")} onRetry={() => void items.refetch()} /> : null}
      <ul className="space-y-3">
        {(items.data ?? []).map((item) => (
          <li key={item.id} data-testid="my-feedback" className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-gray-900">{item.title ?? statusWords(item.type)}</p>
              <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">{statusWords(item.status)}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {statusWords(item.type)} · sent {new Date(item.createdAt).toLocaleDateString()}
              {item.featureKey ? ` · ${item.featureKey}` : ""}
            </p>
            {item.body ? <p className="mt-2 whitespace-pre-wrap text-gray-700">{item.body}</p> : null}
            {item.comments.length > 0 ? (
              <ul className="mt-3 space-y-2 border-t border-gray-100 pt-2">
                {item.comments.map((comment) => (
                  <li key={comment.id} className="rounded-md bg-gray-50 p-2">
                    <p className="text-xs font-semibold text-gray-600">Fauward · {new Date(comment.createdAt).toLocaleDateString()}</p>
                    <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
        {!items.isLoading && !items.isError && (items.data ?? []).length === 0 ? <li className="text-sm text-gray-500">You have not sent any feedback yet.</li> : null}
      </ul>
      <FeedbackDialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)} initialType={dialog ?? "GENERAL"} source="HELP_MENU" key={dialog ?? "closed"} />
    </PageShell>
  );
}
