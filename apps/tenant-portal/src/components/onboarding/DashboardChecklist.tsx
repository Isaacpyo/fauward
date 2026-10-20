import { Link } from "react-router-dom";
import { X } from "lucide-react";

import type { OnboardingChecklist } from "@/components/onboarding/checklist-api";

type DashboardChecklistProps = {
  checklist: OnboardingChecklist;
  onDismiss: () => void;
};

/** The dashboard view of the server checklist (WP-2.17): what is done and where to do the rest. */
export function DashboardChecklist({ checklist, onDismiss }: DashboardChecklistProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4" data-testid="dashboard-checklist">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Launch checklist</h3>
        <button type="button" onClick={onDismiss} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Hide checklist">
          <X size={14} />
        </button>
      </div>
      <ul className="space-y-2">
        {checklist.steps.map((step) => (
          <li key={step.step} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
            <span className={step.doneAt ? "text-green-700" : "text-gray-700"}>
              {step.doneAt ? "✅" : "⬜"} {step.label}
            </span>
            {!step.doneAt ? (
              <Link to={step.actionPath} className="text-[var(--tenant-primary)] hover:underline">
                Do this now
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
