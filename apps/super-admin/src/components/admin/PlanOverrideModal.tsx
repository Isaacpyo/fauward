import { useState } from "react";

type PlanOverrideModalProps = {
  open: boolean;
  tenantName?: string;
  onClose: () => void;
  onConfirm: (plan: "Starter" | "Pro" | "Enterprise") => void;
};

export function PlanOverrideModal({ open, tenantName, onClose, onConfirm }: PlanOverrideModalProps) {
  const [plan, setPlan] = useState<"Starter" | "Pro" | "Enterprise">("Pro");

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-md border border-[var(--color-border)] bg-white p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Override plan</h3>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{tenantName ?? "Tenant"} plan override (SUPER_ADMIN only).</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          {(["Starter", "Pro", "Enterprise"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPlan(option)}
              className={`rounded border px-2 py-1.5 ${plan === option ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)]"}`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2 text-xs">
          <button type="button" className="rounded border border-[var(--color-border)] px-3 py-1.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-[var(--fauward-amber)] px-3 py-1.5 text-white"
            onClick={() => {
              onConfirm(plan);
              onClose();
            }}
          >
            Confirm {plan}
          </button>
        </div>
      </div>
    </div>
  );
}

