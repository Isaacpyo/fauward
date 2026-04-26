import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { User } from "@/types/domain";
import { Button } from "@/components/ui/Button";
import { formatPlanLabel, hasPlanAccess } from "@/lib/plan-features";

type PlanGateProps = {
  minimumPlan: User["plan"];
  currentPlan: User["plan"] | undefined;
  children: ReactNode;
};

export function PlanGate({ minimumPlan, currentPlan, children }: PlanGateProps) {
  const hasAccess = hasPlanAccess(currentPlan, minimumPlan);

  if (!hasAccess) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-8">
        <h3 className="text-lg font-semibold text-amber-900">Upgrade required</h3>
        <p className="mt-2 text-sm text-amber-800">
          This feature requires the {formatPlanLabel(minimumPlan)} plan or higher.
        </p>
        <Button asChild className="mt-4">
          <Link to="/settings?tab=billing">Upgrade plan</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
