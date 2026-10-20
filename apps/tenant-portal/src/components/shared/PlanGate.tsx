import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { User } from "@/types/domain";
import { Button } from "@/components/ui/Button";
import { useFeatureAccess } from "@/hooks/useEntitlements";
import { BACKEND_FEATURE_KEY, formatPlanLabel, type FeatureKey } from "@/lib/plan-features";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";

type PlanGateProps = {
  minimumPlan: User["plan"];
  /** When the backend gates this with requireFeature, pass its key: the live entitlements (incl. overrides) decide. */
  feature?: FeatureKey;
  children: ReactNode;
};

/** Shows children when the workspace's live entitlements allow it (WP-1.4), otherwise the upgrade prompt. */
export function PlanGate({ minimumPlan, feature, children }: PlanGateProps) {
  const access = useFeatureAccess();
  const hasAccess = feature ? access.hasFeature(feature) : access.hasPlan(minimumPlan);
  const [requesting, setRequesting] = useState(false);

  if (!hasAccess) {
    return (
      <div data-testid="plan-gate-locked" className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-8">
        <h3 className="text-lg font-semibold text-amber-900">Upgrade required</h3>
        <p className="mt-2 text-sm text-amber-800">
          This feature requires the {formatPlanLabel(minimumPlan)} plan or higher.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/settings?tab=billing">Upgrade plan</Link>
          </Button>
          {feature ? (
            <Button variant="secondary" onClick={() => setRequesting(true)}>
              Request this feature
            </Button>
          ) : null}
        </div>
        {feature ? (
          <FeedbackDialog open={requesting} onOpenChange={setRequesting} initialType="FEATURE_REQUEST" source="PLAN_GATE" featureKey={BACKEND_FEATURE_KEY[feature] ?? feature} featureLabel={feature.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)} />
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
