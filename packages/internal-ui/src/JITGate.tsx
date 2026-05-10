import { useState, type ReactNode } from 'react';
import { usePermission, type Permission } from '@fauward/internal-rbac';
import { ReasonModal } from './ReasonModal.js';

type JITGateProps = {
  permission: Permission;
  children: ReactNode;
  requestTitle?: string;
  onRequest: (permission: Permission, reason: string) => void | Promise<void>;
  fallback?: ReactNode;
};

export function JITGate({ permission, children, requestTitle = 'Request elevated access', onRequest, fallback }: JITGateProps) {
  const allowed = usePermission(permission);
  const [open, setOpen] = useState(false);

  if (allowed) return <>{children}</>;

  return (
    <>
      {fallback ?? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--fauward-navy)]">
          Request access
        </button>
      )}
      <ReasonModal
        open={open}
        title={requestTitle}
        description={`Request temporary permission: ${permission}`}
        confirmLabel="Request"
        onCancel={() => setOpen(false)}
        onConfirm={async (reason) => {
          await onRequest(permission, reason);
          setOpen(false);
        }}
      />
    </>
  );
}
