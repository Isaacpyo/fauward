import { useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  const initialQuery = searchParams.get("q") ?? "";
  const jobs = useFieldDataStore((state) => state.jobs);
  const [stageFilter, setStageFilter] = useState<WorkflowStage | "all">("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const deferredQuery = useDeferredValue(initialQuery);

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status !== "completed"),
    [jobs],
  );

  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === "completed"),
    [jobs],
  );

  const stageOptions = useMemo(
    () =>
      Array.from(new Set(activeJobs.map((job) => job.workflowStage))).sort((left, right) =>
        workflowStageLabel[left].localeCompare(workflowStageLabel[right]),
      ),
    [activeJobs],
  );

  const visibleJobs = activeJobs
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
        subtitle="Assigned jobs can cover shipment creation, warehouse work, dispatch, pickup, linehaul, delivery, and returns."
      />

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

      {completedJobs.length > 0 && (
        <div>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 py-2"
            onClick={() => setShowCompleted((prev) => !prev)}
          >
            <span className="tiny-label">Completed jobs ({completedJobs.length})</span>
            <span className="text-xs text-stone-400">{showCompleted ? "Hide" : "Show"}</span>
          </button>
          {showCompleted && (
            <div className="mt-3 space-y-3">
              {completedJobs.map((job) => <JobCard key={job.id} job={job} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
