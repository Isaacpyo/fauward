import { useState } from "react";
import type { Permission } from "@fauward/internal-rbac";

import { useCreateJitRequest } from "@/pillars/trust/jit/api";
import { ActionDialog } from "./ActionDialog";

/** Same limits the backend enforces (trust.jit catalogue entry): reason ≥ 20, duration ≤ 240 min, ROOT ≤ 60 min. */
export const JIT_DURATIONS: readonly number[] = [30, 60, 120, 240];
export const JIT_MIN_REASON = 20;
export const JIT_ROOT_MAX_MINUTES = 60;

type JitRequestDialogProps = { open: boolean; permission: Permission; onClose: () => void; onRequested?: () => void };

/** Request temporary elevation for one permission (D2: every role holds trust.jit.request). Errors are shown, not swallowed. */
export function JitRequestDialog({ open, permission, onClose, onRequested }: JitRequestDialogProps) {
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const create = useCreateJitRequest();
  return (
    <ActionDialog
      open={open}
      title="Request access"
      description={
        <>
          Ask an approver for temporary access to <code className="font-mono text-xs">{permission}</code>. You will see it in your session as soon as it is approved.
        </>
      }
      confirmLabel="Send request"
      dangerous
      minReason={JIT_MIN_REASON}
      onClose={onClose}
      onSubmit={async (reason) => {
        await create.mutateAsync({ permission, reason, durationMinutes });
        onRequested?.();
      }}
    >
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]" htmlFor="jit-duration">
        Duration
      </label>
      <select
        id="jit-duration"
        value={durationMinutes}
        onChange={(event) => setDurationMinutes(Number(event.target.value))}
        className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
      >
        {JIT_DURATIONS.map((minutes) => (
          <option key={minutes} value={minutes}>
            {minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes > 60 ? "s" : ""}`}
          </option>
        ))}
      </select>
    </ActionDialog>
  );
}
