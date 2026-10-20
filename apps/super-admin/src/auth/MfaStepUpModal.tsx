import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { consoleApi } from "@/lib/console-api";
import { apiErrorMessage } from "@/lib/console-api-error";
import { StepUpCancelledError, registerStepUpHandler, type StepUpRequest } from "@/lib/mfa-step-up";
import { ME_QUERY_KEY } from "@/lib/use-me";
import { MfaCodeInput } from "./MfaCodeInput";

/** Opened by the console API client on 403 MFA_REQUIRED; the original request is replayed after a valid code. */
export function MfaStepUpModal() {
  const queryClient = useQueryClient();
  const [request, setRequest] = useState<StepUpRequest | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      registerStepUpHandler((next) => {
        setCode("");
        setError(null);
        setRequest(next);
      }),
    []
  );

  if (!request) return null;
  const active = request;

  function cancel() {
    setRequest(null);
    active.reject(new StepUpCancelledError());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await consoleApi.post("/auth/mfa/verify", { code });
      setRequest(null);
      active.resolve();
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    } catch (err: unknown) {
      setCode("");
      setError(apiErrorMessage(err, "That code is not valid."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="mfa-step-up-title">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-[var(--color-border)] bg-white p-5 shadow-xl">
        <div>
          <h2 id="mfa-step-up-title" className="text-base font-semibold text-[var(--color-text-primary)]">
            Confirm it’s you
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">This action needs a fresh MFA check. Enter the 6-digit code from your authenticator app.</p>
        </div>
        <MfaCodeInput id="mfa-step-up-code" value={code} onChange={setCode} autoFocus />
        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button type="submit" disabled={busy || code.length !== 6} className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
