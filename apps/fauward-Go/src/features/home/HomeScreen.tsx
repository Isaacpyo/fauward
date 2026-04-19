import { Link } from "react-router-dom";
import { StatCard } from "@/components/common/StatCard";
import { pluralize } from "@/lib/utils/formatters";
import { useFieldDataStore } from "@/store/useFieldDataStore";
export const HomeScreen = () => {
  const jobs = useFieldDataStore((state) => state.jobs);
  const routes = useFieldDataStore((state) => state.routes);
  const stops = useFieldDataStore((state) => state.stops);
  const pendingMutations = useFieldDataStore((state) => state.pendingMutations);
  const podDrafts = useFieldDataStore((state) => state.podDrafts);
  const scanVerifications = useFieldDataStore((state) => state.scanVerifications);

  const activeRoute = routes[0];
  const activeStops = stops.filter((stop) => stop.status === "assigned" || stop.status === "in_progress");
  const nextStop = activeStops.sort((left, right) => left.sequence - right.sequence)[0];
  const pendingCount = pendingMutations.filter((mutation) => mutation.state !== "synced").length;
  const podReadyCount = podDrafts.filter((draft) => draft.state === "ready" || draft.state === "draft").length;
  const matchedScans = scanVerifications.filter((record) => record.result === "matched").length;
  const nextPodDraft = podDrafts.find((draft) => draft.stopId && (draft.state === "draft" || draft.state === "ready"));

  return (
    <section className="space-y-6">
      <article className="panel-accent p-5">
        <p className="tiny-label text-brand">Assigned flow</p>
        <h2 className="mt-2 font-display text-[1.8rem] text-ink">{activeRoute?.label ?? "No route assigned"}</h2>
        <p className="mt-2 text-sm text-stone-600">
          {activeRoute?.area} - Van {activeRoute?.vehicleLabel} - {activeRoute?.shiftWindow}
        </p>
        <div className="mt-5">
          <Link to={nextStop ? `/stops/${nextStop.id}` : "/jobs"} className="secondary-btn w-full">
            Jump to next stop
          </Link>
        </div>
      </article>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/jobs" className="block">
          <StatCard label="Assigned" value={String(jobs.length)} helper={pluralize(activeStops.length, "open stop")} />
        </Link>
        <Link to="/sync" className="block">
          <StatCard label="Queued" value={String(pendingCount)} helper="Offline-safe updates" />
        </Link>
        <Link to="/jobs" className="block">
          <StatCard label="Verified" value={String(matchedScans)} helper="Matched shipment scans" />
        </Link>
        <Link to={nextPodDraft?.stopId ? `/stops/${nextPodDraft.stopId}/pod` : "/jobs"} className="block">
          <StatCard label="POD" value={String(podReadyCount)} helper="Drafts awaiting upload" />
        </Link>
      </div>

      <div className="grid gap-3">
        <Link
          to="/jobs?mode=search"
          className="rounded-[1.6rem] border border-brand/20 bg-brand-soft/80 p-5 shadow-panel transition hover:-translate-y-0.5"
        >
          <p className="tiny-label text-brand">Verification</p>
          <h2 className="mt-2 text-lg font-semibold text-ink">Scan shipment, package, or label</h2>
          <p className="mt-2 text-sm text-stone-700">Live scanner plus manual fallback.</p>
        </Link>
      </div>
    </section>
  );
};
