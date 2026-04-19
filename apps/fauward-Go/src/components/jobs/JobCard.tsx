import { Link } from "react-router-dom";
import { StatusPill } from "@/components/common/StatusPill";
import { jobStatusLabel, priorityLabel, priorityTone, workflowStageLabel, type FieldJob } from "@/types/field";

type JobCardProps = {
  job: FieldJob;
};

export const JobCard = ({ job }: JobCardProps) => {
  const detailHref = job.stopId ? `/stops/${job.stopId}` : "/jobs";

  return (
    <article className="action-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tiny-label">
            {workflowStageLabel[job.workflowStage]} - {job.shipmentId}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ink">{job.address}</h2>
          <p className="mt-1 text-sm text-stone-600">{job.contactName ?? "No contact assigned"}</p>
        </div>
        <StatusPill label={priorityLabel[job.priority]} tone={priorityTone[job.priority]} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <StatusPill
          label={jobStatusLabel[job.status]}
          tone={
            job.status === "failed"
              ? "danger"
              : job.status === "completed"
                ? "success"
                : job.status === "in_progress"
                  ? "info"
                  : "neutral"
          }
        />
        <span className="text-sm font-medium text-brand">
          {job.timeWindowStart} - {job.timeWindowEnd}
        </span>
      </div>
      <Link to={detailHref} className="primary-btn mt-4 w-full">
        Open job
      </Link>
    </article>
  );
};
