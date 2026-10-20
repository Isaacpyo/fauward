import { Link } from "react-router-dom";
import { CheckCircle2, Circle } from "lucide-react";

import { useOnboardingChecklist } from "@/components/onboarding/checklist-api";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageShell } from "@/layouts/PageShell";
import { apiErrorMessage } from "@/lib/api-error";

/**
 * Onboarding (L7, WP-2.17): each step links to the place where it is really done. A step turns green when the server
 * sees it happen — a shipment created, a gateway verified, a teammate signed in — not when "Next" is clicked.
 */
export function OnboardingPage() {
  const checklist = useOnboardingChecklist();
  const steps = checklist.data?.steps ?? [];
  const required = steps.filter((step) => step.required);
  const doneRequired = required.filter((step) => step.doneAt).length;

  return (
    <PageShell title="Set up your workspace" description="Each step completes when you actually do it. Come back here any time to see what is left.">
      {checklist.isError ? <ErrorState title="Your setup checklist could not be loaded" description={apiErrorMessage(checklist.error, "The onboarding service returned an error.")} onRetry={() => void checklist.refetch()} /> : null}
      {checklist.isLoading ? <p className="text-sm text-gray-500">Loading your checklist…</p> : null}
      {checklist.data ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-700" data-testid="onboarding-progress">
            {checklist.data.completedAt ? `Setup complete on ${new Date(checklist.data.completedAt).toLocaleDateString()}.` : `${doneRequired} of ${required.length} required steps done.`}
          </p>
          <ol className="space-y-3">
            {steps.map((step) => (
              <li key={step.step} data-testid="onboarding-step" className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  {step.doneAt ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" aria-label="Done" /> : <Circle className="mt-0.5 h-5 w-5 text-gray-300" aria-label="Not done" />}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {step.label}
                      {step.required ? null : <span className="ml-2 text-xs font-normal text-gray-500">optional</span>}
                    </p>
                    <p className="text-xs text-gray-500">{step.doneAt ? `Done ${new Date(step.doneAt).toLocaleString()}` : "Not done yet"}</p>
                  </div>
                </div>
                {!step.doneAt ? (
                  <Link to={step.actionPath} className="text-sm font-semibold text-[var(--tenant-primary)] hover:underline">
                    Do this now
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </PageShell>
  );
}
