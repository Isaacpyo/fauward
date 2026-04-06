import { useState } from "react";

type TenantDetailTabsProps = {
  tenantId: string;
};

const tabKeys = ["Overview", "Shipments", "Billing", "Team", "Config", "Audit Log"] as const;
type TabKey = (typeof tabKeys)[number];

export function TenantDetailTabs({ tenantId }: TenantDetailTabsProps) {
  const [tab, setTab] = useState<TabKey>("Overview");
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(new Set(["Overview"]));

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tabKeys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setVisitedTabs((previous) => new Set([...previous, key]));
            }}
            className={`rounded px-3 py-1.5 text-xs font-medium ${tab === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)] bg-white text-[var(--color-text-muted)]"}`}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="rounded-md border border-[var(--color-border)] bg-white p-3 text-xs">
        {visitedTabs.has("Overview") && tab === "Overview" ? <p>Usage stats and key metrics for tenant {tenantId}.</p> : null}
        {visitedTabs.has("Shipments") && tab === "Shipments" ? <p>Read-only shipments table slice for tenant {tenantId}.</p> : null}
        {visitedTabs.has("Billing") && tab === "Billing" ? <p>Plan, payment history, MRR, and Stripe customer link.</p> : null}
        {visitedTabs.has("Team") && tab === "Team" ? <p>Staff members, roles, and last activity.</p> : null}
        {visitedTabs.has("Config") && tab === "Config" ? <pre className="font-mono text-[11px]">{JSON.stringify({ tenant_id: tenantId, domain: "tenant.fauward.com", timezone: "Europe/London" }, null, 2)}</pre> : null}
        {visitedTabs.has("Audit Log") && tab === "Audit Log" ? <p>Recent SUPER_ADMIN actions on this tenant.</p> : null}
      </div>
    </section>
  );
}
