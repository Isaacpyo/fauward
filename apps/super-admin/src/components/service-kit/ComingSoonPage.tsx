import { Link } from "react-router-dom";

import type { ServiceRef } from "@/pillars/_manifests";
import { StatusPill } from "./StatusPill";

/** Root page of a service with no page yet: deferred (not planned) or planned for a later phase (D1). */
export function ComingSoonPage({ service }: { service: ServiceRef }) {
  const deferred = service.status === "deferred";
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="flex items-center gap-2">
        <service.icon size={20} style={{ color: service.pillar.accent }} />
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{service.name}</h1>
        <StatusPill status={service.status} />
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">{service.description}</p>
      <div data-testid="coming-soon" className="rounded-lg border border-[var(--color-border)] bg-white p-5 text-sm">
        {deferred ? (
          <>
            <p className="font-semibold text-[var(--color-text-primary)]">Not planned</p>
            <p className="mt-1 text-[var(--color-text-muted)]">{service.note}</p>
          </>
        ) : (
          <>
            <p className="font-semibold text-[var(--color-text-primary)]">{service.livePhase !== null ? `Coming in Phase ${service.livePhase}` : "Being removed"}</p>
            {service.note ? <p className="mt-1 text-[var(--color-text-muted)]">{service.note}</p> : null}
          </>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <dt className="text-[var(--color-text-muted)]">Owner team</dt>
          <dd className="text-[var(--color-text-primary)]">{service.owner}</dd>
          <dt className="text-[var(--color-text-muted)]">Decision record</dt>
          <dd className="font-mono text-[var(--color-text-primary)]">docs/adr/0002-console-target-state.md</dd>
        </dl>
      </div>
      <Link to={service.pillar.route} className="inline-flex text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
        Back to {service.pillar.name}
      </Link>
    </div>
  );
}
