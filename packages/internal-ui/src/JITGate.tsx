import { useState, type ReactNode } from 'react';
import { usePermission, type Permission } from '@fauward/internal-rbac';
import { ReasonModal } from './ReasonModal.js';

type JITGateProps = {
  permission: Permission;
  children: ReactNode;
  /** Rendered instead of the children without the permission (usually an access-denied panel with its own request dialog). */
  fallback?: ReactNode;
  /** Only used without a `fallback`: the built-in "Request access" button sends the request through this. */
  onRequest?: (permission: Permission, reason: string) => Promise<void>;
  requestTitle?: string;
};

function errorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const response = (error as { response?: { data?: { message?: unknown; error?: unknown } } }).response?.data;
    if (typeof response?.message === 'string') return response.message;
    if (typeof response?.error === 'string') return response.error;
    if (error instanceof Error) return error.message;
  }
  return 'The request failed.';
}

export function JITGate({ permission, children, fallback, onRequest, requestTitle = 'Request elevated access' }: JITGateProps) {
  const allowed = usePermission(permission);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (allowed) return <>{children}</>;
  if (fallback !== undefined || !onRequest) return <>{fallback ?? null}</>;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--fauward-navy)]">
        Request access
      </button>
      <ReasonModal
        open={open}
        title={requestTitle}
        description={`Request temporary permission: ${permission}`}
        confirmLabel="Request"
        error={error}
        onCancel={() => {
          setError(null);
          setOpen(false);
        }}
        onConfirm={(reason) => {
          setError(null);
          // Errors stay in the dialog (ACC-JIT-6); it closes only after the request was accepted.
          onRequest(permission, reason).then(
            () => setOpen(false),
            (err: unknown) => setError(errorMessage(err))
          );
        }}
      />
    </>
  );
}
