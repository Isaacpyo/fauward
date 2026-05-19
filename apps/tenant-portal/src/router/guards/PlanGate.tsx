import { ReactNode } from 'react';
import { useTenantStore } from '@/stores/useTenantStore';

export function PlanGate({ plans, children, mode, message, flagKey }: { plans: string[]; children: ReactNode; mode?: 'upgrade'; message?: string; flagKey?: string }) {
  const tenant = useTenantStore((s) => s.tenant);
  if (!tenant) return null;
  if (plans.includes((tenant as { plan?: string }).plan ?? '') || (flagKey ? tenant.featureFlags?.[flagKey] === true : false)) return <>{children}</>;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-5">
      <p className="text-sm text-[var(--color-text-primary)]">{message ?? 'Upgrade required'}</p>
      {mode === 'upgrade' && (
        <a className="mt-2 inline-flex text-sm font-medium text-[var(--color-primary-base)]" href="https://fauward.com/upgrade">Upgrade</a>
      )}
    </div>
  );
}
