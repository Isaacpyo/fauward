import { Link } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";

export type TenantSuspensionState = {
  suspended: boolean;
  closed: boolean;
  category: "BILLING" | "FRAUD" | "AUP" | "SECURITY" | "LEGAL" | "OTHER" | null;
  publicReason: string | null;
  since: string | null;
  appealable: boolean;
  appeal: { id: string; status: string; createdAt: string; decidedAt: string | null; resolution: string | null } | null;
};

const CATEGORY_LABEL: Record<NonNullable<TenantSuspensionState["category"]>, string> = {
  BILLING: "Billing",
  FRAUD: "Account review",
  AUP: "Acceptable use",
  SECURITY: "Security",
  LEGAL: "Legal",
  OTHER: "Other"
};

const APPEAL_MIN_LENGTH = 50;
export const SUSPENSION_QUERY_KEY = ["tenant", "me", "suspension"] as const;

function errorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    return data?.message ?? data?.error ?? "Unable to submit the appeal right now.";
  }
  return "Unable to submit the appeal right now.";
}

function appealStatusText(appeal: NonNullable<TenantSuspensionState["appeal"]>) {
  if (appeal.status === "APPROVED") return "Your appeal was approved.";
  if (appeal.status === "REJECTED") return "Your appeal was reviewed and the suspension stays in place.";
  return "Your appeal is with Fauward for review.";
}

type SuspendedOverlayProps = { active: boolean };

/** The tenant's view of a suspension (D3): category, public reason, since when, and the appeal state from the API. */
export function SuspendedOverlay({ active }: SuspendedOverlayProps) {
  const queryClient = useQueryClient();
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const state = useQuery({
    queryKey: SUSPENSION_QUERY_KEY,
    queryFn: async () => (await api.get<TenantSuspensionState>("/v1/tenants/me/suspension")).data,
    enabled: active
  });

  if (!active) return null;

  async function submitAppeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.post("/v1/tenants/me/suspension-appeal", { reason: appealReason, contactEmail });
      setAppealOpen(false);
      await queryClient.invalidateQueries({ queryKey: SUSPENSION_QUERY_KEY });
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const data = state.data;
  return (
    <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/45 p-4">
      <div role="alertdialog" aria-labelledby="suspended-title" className="w-full max-w-lg rounded-lg border border-red-300 bg-white p-6">
        <h2 id="suspended-title" className="text-xl font-semibold text-red-700">
          {data?.closed ? "Workspace closed" : "Account suspended"}
        </h2>
        {state.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading the suspension details…</p> : null}
        {state.isError ? <p className="mt-2 text-sm text-gray-700">Access is restricted. The details could not be loaded; contact support@fauward.com.</p> : null}
        {data ? (
          <div className="mt-2 space-y-2 text-sm text-gray-700">
            {data.category ? (
              <p>
                <span className="font-semibold">Reason category:</span> {CATEGORY_LABEL[data.category]}
              </p>
            ) : null}
            {data.publicReason ? <p data-testid="suspension-public-reason">{data.publicReason}</p> : null}
            {data.since ? <p className="text-xs text-gray-500">Since {new Date(data.since).toLocaleString()}</p> : null}
            {data.appeal ? (
              <div data-testid="suspension-appeal" className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="font-semibold">{appealStatusText(data.appeal)}</p>
                {data.appeal.resolution ? <p className="mt-1">{data.appeal.resolution}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <p className="mt-2 text-sm text-gray-700">support@fauward.com</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data?.category === "BILLING" ? (
            <Button asChild>
              <Link to="/settings?tab=billing">Open billing settings</Link>
            </Button>
          ) : null}
          {data?.appealable ? (
            <Button variant="secondary" onClick={() => setAppealOpen((open) => !open)}>
              Submit an appeal
            </Button>
          ) : null}
        </div>

        {appealOpen && data?.appealable ? (
          <form className="mt-5 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3" onSubmit={submitAppeal}>
            <Input type="email" required aria-label="Contact email" placeholder="Contact email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
            <Textarea
              required
              aria-label="Appeal"
              minLength={APPEAL_MIN_LENGTH}
              placeholder={`Explain why the suspension should be reviewed (at least ${APPEAL_MIN_LENGTH} characters)`}
              value={appealReason}
              onChange={(event) => setAppealReason(event.target.value)}
            />
            <Button type="submit" disabled={submitting || appealReason.trim().length < APPEAL_MIN_LENGTH}>
              {submitting ? "Submitting..." : "Send appeal"}
            </Button>
            {submitError ? <p className="text-sm text-red-700">{submitError}</p> : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
