import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StatCard } from "@/components/common/StatCard";
import { pluralize } from "@/lib/utils/formatters";
import { useFieldDataStore } from "@/store/useFieldDataStore";
export const HomeScreen = () => {
  const navigate = useNavigate();
  const jobs = useFieldDataStore((state) => state.jobs);
  const stops = useFieldDataStore((state) => state.stops);
  const pendingMutations = useFieldDataStore((state) => state.pendingMutations);
  const podDrafts = useFieldDataStore((state) => state.podDrafts);
  const scanVerifications = useFieldDataStore((state) => state.scanVerifications);
  const hydrateAssignedWork = useFieldDataStore((state) => state.hydrateAssignedWork);
  const isHydrating = useFieldDataStore((state) => state.isHydrating);
  const [queryInput, setQueryInput] = useState("");

  useEffect(() => {
    void hydrateAssignedWork();
  }, [hydrateAssignedWork]);

  const activeStops = stops.filter((stop) => stop.status === "assigned" || stop.status === "in_progress");
  const pendingCount = pendingMutations.filter((mutation) => mutation.state !== "synced").length;
  const podReadyCount = podDrafts.filter((draft) => draft.state === "ready" || draft.state === "draft").length;
  const matchedScans = scanVerifications.filter((record) => record.result === "matched").length;
  const nextPodDraft = podDrafts.find((draft) => draft.stopId && (draft.state === "draft" || draft.state === "ready"));

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = queryInput.trim();
    navigate(trimmed ? `/jobs?q=${encodeURIComponent(trimmed)}` : "/jobs");
  };

  return (
    <section className="space-y-6">
      <form className="panel p-4" onSubmit={handleSearch}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor="job-search" className="tiny-label">
            Search assigned jobs
          </label>
          <button
            type="button"
            onClick={() => void hydrateAssignedWork()}
            disabled={isHydrating}
            aria-label={isHydrating ? "Syncing assigned work" : "Refresh assigned work"}
            title={isHydrating ? "Syncing…" : "Refresh"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-brand transition hover:bg-brand-soft disabled:opacity-40"
          >
            <svg
              className={`h-4 w-4 ${isHydrating ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 10a8 8 0 0 0-14.93-3M4 14a8 8 0 0 0 14.93 3" />
            </svg>
          </button>
        </div>
        <input
          id="job-search"
          className="field-input"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Search by reference number or name"
        />
        <button type="submit" className="primary-btn mt-4 w-full">
          Search
        </button>
        <div className="mt-3">
          <Link to="/scan" className="secondary-btn w-full">
            Scan QR code
          </Link>
        </div>
      </form>

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
          to="/scan"
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
