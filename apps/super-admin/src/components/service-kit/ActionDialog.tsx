import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { apiErrorMessage } from "@/lib/console-api-error";

type ActionDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  /** Dangerous actions require a free-text reason (architecture §2.1). */
  dangerous?: boolean;
  minReason?: number;
  /** Extra form fields rendered above the reason. */
  children?: ReactNode;
  /** Extra validation for the custom fields; return a message to block submit. */
  validate?: () => string | null;
  onSubmit: (reason: string) => Promise<unknown>;
  onClose: () => void;
};

/**
 * Confirm dialog for every console mutation (service kit §6.2): disables while submitting (no double submit),
 * shows the API error, and closes only after the API confirms. Never reports success before the response.
 */
export function ActionDialog({ open, title, description, confirmLabel, dangerous = false, minReason = 8, children, validate, onSubmit, onClose }: ActionDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const reasonOk = !dangerous || reason.trim().length >= minReason;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !reasonOk) return;
    const invalid = validate?.() ?? null;
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The action failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title">
      <form onSubmit={submit} className="my-auto w-full max-w-md space-y-4 rounded-lg border border-[var(--color-border)] bg-white p-5 shadow-xl">
        <div>
          <h2 id="action-dialog-title" className="text-base font-semibold text-[var(--color-text-primary)]">
            {title}
          </h2>
          {description ? <div className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</div> : null}
        </div>
        {children}
        {dangerous ? (
          <div>
            <label htmlFor="action-dialog-reason" className="block text-xs font-semibold text-[var(--color-text-muted)]">
              Reason (recorded in the audit log, at least {minReason} characters)
            </label>
            <textarea
              id="action-dialog-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--fauward-navy)]"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={submitting || !reasonOk} className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? "Working..." : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
