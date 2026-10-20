import { ReactNode } from 'react';
import { useFeatureAccess } from '@/hooks/useEntitlements';

/** Legacy admin-feature gate: allowed plans are checked against the live effective plan (WP-1.4), not the stored plan. */
export function PlanGate({ plans, children, mode, message }: { plans: string[]; children: ReactNode; mode?: 'upgrade'; message?: string; flagKey?: string }) {
  const access = useFeatureAccess();
  if (plans.map((plan) => plan.toLowerCase()).includes(access.plan)) return <>{children}</>;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-5">
      <p className="text-sm text-[var(--color-text-primary)]">{message ?? 'Upgrade required'}</p>
      {mode === 'upgrade' && (
        <a className="mt-2 inline-flex text-sm font-medium text-[var(--color-primary-base)]" href="https://fauward.com/upgrade">Upgrade</a>
      )}
    </div>
  );
}
