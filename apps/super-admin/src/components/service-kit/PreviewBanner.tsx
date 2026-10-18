import type { PillarServiceManifest } from "@/pillars/_manifests";

/** Shown on every page of a `preview` service: names what is not wired yet (D1). */
export function PreviewBanner({ service }: { service: Pick<PillarServiceManifest, "name" | "note" | "livePhase"> }) {
  return (
    <div role="note" data-testid="preview-banner" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">
        Preview: {service.name}
        {service.livePhase !== null ? <span className="font-normal"> (goes live in Phase {service.livePhase})</span> : null}
      </p>
      {service.note ? <p className="mt-0.5">Not wired yet: {service.note}</p> : null}
    </div>
  );
}
