type SuspendDialogProps = {
  open: boolean;
  tenantName?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function SuspendDialog({ open, tenantName, onClose, onConfirm }: SuspendDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-md border border-[var(--color-border)] bg-white p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Suspend tenant</h3>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">Suspend {tenantName ?? "this tenant"}? This action will block tenant access until reversed.</p>
        <div className="mt-4 flex justify-end gap-2 text-xs">
          <button type="button" className="rounded border border-[var(--color-border)] px-3 py-1.5" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="rounded bg-red-600 px-3 py-1.5 text-white" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

