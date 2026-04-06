import { useState } from "react";

import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";

export function ImpersonationPage() {
  const [tenantQuery, setTenantQuery] = useState("");
  const [activeTenant, setActiveTenant] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {activeTenant ? <ImpersonationBanner tenantName={activeTenant} onExit={() => setActiveTenant(null)} /> : null}
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Impersonation</h1>
      <section className="rounded-md border border-[var(--color-border)] bg-white p-3">
        <label className="text-xs font-medium text-[var(--color-text-muted)]">Search tenant by name/domain</label>
        <input
          value={tenantQuery}
          onChange={(event) => setTenantQuery(event.target.value)}
          className="mt-1 h-10 w-full rounded border border-[var(--color-border)] px-2 text-xs"
          placeholder="northline.app"
        />
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">You will view the platform as the tenant. All actions are logged.</p>
        <button
          type="button"
          className="mt-3 rounded bg-[var(--fauward-amber)] px-3 py-2 text-xs font-semibold text-white"
          onClick={() => {
            const tenant = tenantQuery.trim() || "northline.app";
            setActiveTenant(tenant);
            window.open(`/tenant?impersonation=${encodeURIComponent(tenant)}`, "_blank");
          }}
        >
          Impersonate
        </button>
      </section>
    </div>
  );
}

