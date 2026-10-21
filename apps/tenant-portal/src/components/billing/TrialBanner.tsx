import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { useAppStore } from "@/stores/useAppStore";

// Trial banner with "Request more time" (gtm.trials, WP-4.14): a workspace admin asks Fauward for up to `maxDays`
// more days with a reason; the request's status (pending, approved with the new end date, declined with the reason)
// shows here, and the days left come from the server once it answers.

type TrialStatus = {
  trialing: boolean;
  trialEnd: string | null;
  daysRemaining: number | null;
  canRequest: boolean;
  maxDays: number;
  latestRequest: {
    id: string;
    status: "PENDING" | "APPROVED" | "DENIED";
    requestedDays: number;
    createdAt: string;
    decidedAt: string | null;
    decisionReason: string | null;
    newTrialEnd: string | null;
  } | null;
};

type TrialBannerProps = {
  days: number;
};

export const TRIAL_STATUS_KEY = ["tenant", "me", "trial-extension"] as const;
const WARN_DAYS = 7;
const RECENT_DECISION_MS = 7 * 24 * 60 * 60 * 1000;
const STATUS_POLL_MS = 5 * 60 * 1000;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function TrialBanner({ days }: TrialBannerProps) {
  const queryClient = useQueryClient();
  const user = useAppStore((state) => state.user);
  const isAdmin = user?.role === "TENANT_ADMIN";
  const [open, setOpen] = useState(false);
  const [requestedDays, setRequestedDays] = useState("7");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({
    queryKey: TRIAL_STATUS_KEY,
    queryFn: async () => (await api.get<TrialStatus>("/v1/tenants/me/trial-extension-request")).data,
    enabled: days > 0,
    refetchInterval: STATUS_POLL_MS,
    retry: false
  });
  const send = useMutation({
    mutationFn: async () => (await api.post<TrialStatus>("/v1/tenants/me/trial-extension-request", { days: Number(requestedDays), reason: reason.trim() })).data,
    onSuccess: (data) => {
      queryClient.setQueryData(TRIAL_STATUS_KEY, data);
      setOpen(false);
      setReason("");
    }
  });

  const trial = status.data;
  const remaining = trial?.trialing && typeof trial.daysRemaining === "number" ? trial.daysRemaining : days;
  const latest = trial?.latestRequest ?? null;
  const recentlyDecided = latest?.decidedAt ? Date.now() - new Date(latest.decidedAt).getTime() < RECENT_DECISION_MS : false;
  const visible = remaining > 0 && (remaining <= WARN_DAYS || latest?.status === "PENDING" || recentlyDecided);
  if (!visible) return null;

  const maxDays = trial?.maxDays ?? 0;
  const canRequest = Boolean(isAdmin && trial?.canRequest && maxDays > 0);

  async function submit() {
    setError(null);
    const value = Number(requestedDays);
    if (!Number.isInteger(value) || value < 1 || value > maxDays) return setError(`Choose between 1 and ${maxDays} days.`);
    if (reason.trim().length < 10) return setError("Tell us briefly why you need more time.");
    try {
      await send.mutateAsync();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The request could not be sent."));
    }
  }

  return (
    <div data-testid="trial-banner" className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <p>
        Your trial expires in {remaining} day{remaining === 1 ? "" : "s"}
        {trial?.trialEnd ? ` (${formatDate(trial.trialEnd)})` : ""}.{" "}
        <Link to="/settings?tab=billing" className="font-semibold underline">
          Upgrade now
        </Link>
        .
        {canRequest && !open ? (
          <>
            {" "}
            <button type="button" className="font-semibold underline" onClick={() => setOpen(true)}>
              Request more time
            </button>
          </>
        ) : null}
      </p>

      {latest ? (
        <p data-testid="trial-extension-status" className="mt-1">
          {latest.status === "PENDING" ? `You asked for ${latest.requestedDays} more days on ${formatDate(latest.createdAt)}; Fauward will reply by email.` : null}
          {latest.status === "APPROVED" && recentlyDecided ? `Fauward extended your trial by ${latest.requestedDays} days${latest.newTrialEnd ? ` to ${formatDate(latest.newTrialEnd)}` : ""}.` : null}
          {latest.status === "DENIED" && recentlyDecided ? `Your request for more time was declined${latest.decisionReason ? `: ${latest.decisionReason}` : "."}` : null}
        </p>
      ) : null}

      {open ? (
        <form
          noValidate
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col text-xs font-medium">
            Extra days (up to {maxDays})
            <input type="number" min={1} max={maxDays} value={requestedDays} onChange={(event) => setRequestedDays(event.target.value)} className="mt-1 w-24 rounded border border-amber-400 bg-white px-2 py-1 text-sm" />
          </label>
          <label className="flex min-w-[16rem] flex-1 flex-col text-xs font-medium">
            Why do you need more time?
            <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 rounded border border-amber-400 bg-white px-2 py-1 text-sm" />
          </label>
          <button type="submit" disabled={send.isPending} className="rounded bg-amber-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-60">
            {send.isPending ? "Sending…" : "Send request"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded px-3 py-1 text-sm underline">
            Cancel
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
