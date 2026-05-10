import { useState } from 'react';
import { cn } from './cn.js';

type ReasonModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  className?: string;
};

export function ReasonModal({ open, title, description, confirmLabel = 'Confirm', onCancel, onConfirm, className }: ReasonModalProps) {
  const [reason, setReason] = useState('');
  if (!open) return null;

  const valid = reason.trim().length >= 8;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className={cn('w-full max-w-md rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-xl dark:bg-neutral-950', className)}>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p> : null}
        <label className="mt-4 block text-xs font-semibold text-[var(--color-text-muted)]" htmlFor="internal-ui-reason">
          Reason
        </label>
        <textarea
          id="internal-ui-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--fauward-navy)] dark:bg-neutral-900"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onConfirm(reason.trim())}
            className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
