import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { apiErrorMessage } from "@/lib/console-api-error";
import { ONBOARDING_STEPS, type OnboardingStep, useNudgeTenant, useOnboardingFunnel, useStuckTenants } from "./api";

// customer.onboarding (L7, WP-2.17): funnel and stuck tenants, both read from the event-stamped onboarding steps.

type Step = OnboardingStep;
const STEPS = ONBOARDING_STEPS;
const stepLabel = (step: Step | null) => STEPS.find((item) => item.id === step)?.label ?? "—";
const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

function OnboardingNav({ current }: { current: "funnel" | "stuck" }) {
  const link = (to: string, label: string, active: boolean) => (
    <Link to={to} aria-current={active ? "page" : undefined} className={active ? "font-semibold text-[var(--fauward-navy)]" : "text-[var(--color-text-muted)]"}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Onboarding" className="flex gap-4 border-b border-[var(--color-border)] pb-2 text-sm">
      {link("/customer/onboarding", "Funnel", current === "funnel")}
      {link("/customer/onboarding/stuck", "Stuck tenants", current === "stuck")}
    </nav>
  );
}

export function OnboardingFunnelPage() {
  const [params, setParams] = useSearchParams();
  const cohort = params.get("cohort") ?? "";
  const funnel = useOnboardingFunnel(cohort);
  const data = funnel.data;
  return (
    <div className="space-y-4">
      <OnboardingNav current="funnel" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Onboarding funnel</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Steps are counted when the tenant really did them (first shipment, verified gateway, …).</p>
        </div>
        <label className="text-xs font-semibold text-[var(--color-text-muted)]">
          Signup month
          <input aria-label="Signup month" type="month" value={cohort} onChange={(event) => setParams(event.target.value ? { cohort: event.target.value } : {}, { replace: true })} className="ml-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-sm" />
        </label>
      </header>
      {funnel.isError ? <ConsoleApiErrorPanel error={funnel.error} onRetry={() => void funnel.refetch()} title="Unable to load the onboarding funnel" /> : null}
      {funnel.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading the funnel…</p> : null}
      {data ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="onboarding-funnel">
          <p className="text-sm">
            {data.accountsCreated} account(s) created {data.cohort ? `in ${data.cohort}` : "in the last 90 days"} · {data.completed} finished onboarding
          </p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="py-1">Step</th>
                <th className="py-1 text-right">Tenants</th>
                <th className="py-1 text-right">From previous</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.steps.map((step) => (
                <tr key={step.step} data-testid="funnel-step">
                  <td className="py-1">
                    {step.label}
                    {step.required ? null : <span className="ml-1 text-xs text-[var(--color-text-muted)]">(optional)</span>}
                  </td>
                  <td className="py-1 text-right tabular-nums">{step.count}</td>
                  <td className="py-1 text-right tabular-nums">{percent(step.conversionFromPrevious)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

export function StuckTenantsPage() {
  const [stuckAt, setStuckAt] = useState<Step | "">("");
  const [stuckDays, setStuckDays] = useState(7);
  const stuck = useStuckTenants(stuckAt, stuckDays);
  const nudge = useNudgeTenant();
  const rows = stuck.data ?? [];
  return (
    <div className="space-y-4">
      <OnboardingNav current="stuck" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Stuck tenants</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Tenants that have not finished onboarding. A nudge emails their admins the next step, at most once a week.</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="Stuck at" value={stuckAt} onChange={(event) => setStuckAt(event.target.value as Step | "")} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
            <option value="">Any required step</option>
            {STEPS.map((step) => (
              <option key={step.id} value={step.id}>
                {step.label}
              </option>
            ))}
          </select>
          <select aria-label="Days since signup" value={stuckDays} onChange={(event) => setStuckDays(Number(event.target.value))} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
            {[3, 7, 14, 30].map((days) => (
              <option key={days} value={days}>
                {days}+ days
              </option>
            ))}
          </select>
        </div>
      </header>
      {stuck.isError ? <ConsoleApiErrorPanel error={stuck.error} onRetry={() => void stuck.refetch()} title="Unable to load stuck tenants" /> : null}
      {stuck.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {stuck.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tenant is stuck with these filters.</p> : null}
      {nudge.isError ? <p className="text-sm text-red-700">{apiErrorMessage(nudge.error, "The nudge was not sent.")}</p> : null}
      {rows.length > 0 ? (
        <table className="w-full rounded-lg border border-[var(--color-border)] bg-white text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-muted)]">
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Signed up</th>
              <th className="px-3 py-2">Next step</th>
              <th className="px-3 py-2">Done</th>
              <th className="px-3 py-2">Last nudge</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((row) => (
              <tr key={row.id} data-testid="stuck-tenant">
                <td className="px-3 py-2">
                  <TenantChip tenantId={row.id} name={row.name} slug={row.slug} />
                </td>
                <td className="px-3 py-2 text-xs">{row.daysSinceSignup} days ago</td>
                <td className="px-3 py-2">{stepLabel(row.nextStep)}</td>
                <td className="px-3 py-2 text-xs">{row.stepsDone.length === 0 ? "nothing yet" : row.stepsDone.map((step) => stepLabel(step)).join(", ")}</td>
                <td className="px-3 py-2 text-xs">{row.lastNudgedAt ? new Date(row.lastNudgedAt).toLocaleDateString() : "never"}</td>
                <td className="px-3 py-2">
                  <PermissionButton
                    permission="customer.success.write"
                    disabled={!row.canNudge || nudge.isPending}
                    title={row.canNudge ? undefined : "Nudged in the last 7 days"}
                    onClick={() => nudge.mutate(row.id)}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50"
                  >
                    Nudge
                  </PermissionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
