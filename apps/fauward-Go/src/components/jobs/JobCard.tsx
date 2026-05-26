import { Link } from "react-router-dom";
import { StatusPill } from "@/components/common/StatusPill";
import { jobStatusLabel, workflowStageLabel, type FieldJob } from "@/types/field";

type JobCardProps = {
  job: FieldJob;
};

const statusTone = (status: FieldJob["status"]) => {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "exception") return "warning" as const;
  return "neutral" as const;
};

export const JobCard = ({ job }: JobCardProps) => {
  const detailHref = `/stops/${job.stopId ?? job.trackingNumber ?? job.shipmentId}`;

  return (
    <article className="action-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tiny-label">
            {workflowStageLabel[job.workflowStage]} · {job.trackingNumber ?? job.shipmentId}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ink">{job.address}</h2>
          <p className="mt-1 text-sm text-stone-600">{job.contactName ?? "No contact assigned"}</p>
        </div>
        <StatusPill label={jobStatusLabel[job.status]} tone={statusTone(job.status)} />
      </div>
      {(job.timeWindowStart || job.timeWindowEnd) && (
        <p className="mt-3 text-sm font-medium text-brand">
          {job.timeWindowStart} - {job.timeWindowEnd}
        </p>
      )}
      <Link to={detailHref} className="primary-btn mt-4 w-full">
        {job.status === "completed" ? "View details" : "Open job"}
      </Link>
    </article>
  );
};
