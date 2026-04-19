import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { JobCard } from "@/components/jobs/JobCard";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { workflowStageLabel, type WorkflowStage } from "@/types/field";

const priorityRank = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
} as const;

export const JobsScreen = () => {
  const [searchParams] = useSearchParams();
  const jobs = useFieldDataStore((state) => state.jobs);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<WorkflowStage | "all">("all");
  const deferredQuery = useDeferredValue(query);
  const searchOnly = searchParams.get("mode") === "search";

  const stageOptions = useMemo(
    () =>
      Array.from(new Set(jobs.map((job) => job.workflowStage))).sort((left, right) =>
        workflowStageLabel[left].localeCompare(workflowStageLabel[right]),
      ),
    [jobs],
  );

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(queryInput);
  };

  const visibleJobs = jobs
    .filter((job) => {
      const haystack = `${job.shipmentId} ${job.contactName ?? ""}`.toLowerCase();
      const matchesQuery = haystack.includes(deferredQuery.trim().toLowerCase());
      const matchesStage = stageFilter === "all" || job.workflowStage === stageFilter;
      return matchesQuery && matchesStage;
    })
    .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority]);

  return (
    <section className="space-y-6">
      <ScreenHeader
        title="Assigned jobs"
        subtitle={
          searchOnly
            ? "Search by reference number or name, or open the QR scanner to find the right job."
            : "Assigned jobs can cover shipment creation, warehouse work, dispatch, pickup, linehaul, delivery, and returns."
        }
      />

      <form className="panel p-4" onSubmit={handleSearch}>
        <label htmlFor="job-search" className="mb-2 block tiny-label">
          Search assigned jobs
        </label>
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
          <Link to="/verify?codeType=qr" className="secondary-btn w-full">
            Scan QR code
          </Link>
        </div>
      </form>

      {!searchOnly ? (
        <>
          <div className="panel flex items-end justify-between gap-3 p-4">
            <div>
              <p className="tiny-label">Jobs</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{visibleJobs.length}</p>
            </div>
            <div className="min-w-[11rem]">
              <label htmlFor="job-stage-filter" className="mb-2 block tiny-label">
                Filter
              </label>
              <select
                id="job-stage-filter"
                className="field-input"
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value as WorkflowStage | "all")}
              >
                <option value="all">All stages</option>
                {stageOptions.map((stage) => (
                  <option key={stage} value={stage}>
                    {workflowStageLabel[stage]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {visibleJobs.length === 0 ? (
              <div className="panel p-5 text-sm text-stone-600">No jobs match the current filter.</div>
            ) : (
              visibleJobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </div>
        </>
      ) : null}
    </section>
  );
};
