import { Link, useParams } from "react-router-dom";
import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { formatTimestamp } from "@/lib/utils/formatters";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import {
  scanResultTone,
  stopStatusLabel,
  stopStatusTone,
  verificationTargetLabel,
  workflowStageLabel,
  type WorkflowStage,
} from "@/types/field";

const workflowConfig: Record<
  WorkflowStage,
  {
    summary: string;
    startLabel: string;
    completeLabel: string;
    verificationEnabled: boolean;
    locationEnabled: boolean;
    proofLabel?: string;
    capabilities: string[];
  }
> = {
  shipment_creation: {
    summary: "Create and validate the shipment record before it moves into the operational network.",
    startLabel: "Start shipment creation",
    completeLabel: "Complete shipment creation",
    verificationEnabled: true,
    locationEnabled: false,
    capabilities: ["Status updates", "Shipment verification"],
  },
  warehouse_intake: {
    summary: "Confirm inbound receipt into the warehouse and validate the shipment or package reference.",
    startLabel: "Start warehouse intake",
    completeLabel: "Complete warehouse intake",
    verificationEnabled: true,
    locationEnabled: false,
    capabilities: ["Status updates", "Shipment verification"],
  },
  dispatch_handoff: {
    summary: "Validate the handoff into dispatch so the shipment is ready for movement.",
    startLabel: "Start dispatch handoff",
    completeLabel: "Complete dispatch handoff",
    verificationEnabled: true,
    locationEnabled: false,
    capabilities: ["Status updates", "Shipment verification"],
  },
  pickup: {
    summary: "Confirm the pickup, validate identifiers, and keep the shipment moving into the network.",
    startLabel: "Start pickup",
    completeLabel: "Complete pickup",
    verificationEnabled: true,
    locationEnabled: true,
    capabilities: ["Status updates", "Shipment verification", "Location updates"],
  },
  linehaul: {
    summary: "Track the movement between facilities and keep telemetry current while the load is in transit.",
    startLabel: "Start linehaul movement",
    completeLabel: "Complete linehaul stage",
    verificationEnabled: false,
    locationEnabled: true,
    capabilities: ["Status updates", "Location updates"],
  },
  delivery: {
    summary: "Verify the shipment at handoff and capture final delivery confirmation before completing the task.",
    startLabel: "Start delivery",
    completeLabel: "Complete delivery",
    verificationEnabled: true,
    locationEnabled: true,
    proofLabel: "Capture delivery confirmation",
    capabilities: ["Status updates", "Shipment verification", "Confirmation capture", "Location updates"],
  },
  return_initiation: {
    summary: "Validate the return, capture customer confirmation, and move the parcel into reverse logistics.",
    startLabel: "Start return collection",
    completeLabel: "Complete return collection",
    verificationEnabled: true,
    locationEnabled: true,
    proofLabel: "Capture return confirmation",
    capabilities: ["Status updates", "Shipment verification", "Confirmation capture", "Location updates"],
  },
  return_receipt: {
    summary: "Confirm the returned parcel is received back into the hub and ready for the next internal step.",
    startLabel: "Start return receipt",
    completeLabel: "Complete return receipt",
    verificationEnabled: true,
    locationEnabled: false,
    capabilities: ["Status updates", "Shipment verification"],
  },
};

export const StopDetailScreen = () => {
  const { stopId } = useParams();
  const stop = useFieldDataStore((state) => state.stops.find((item) => item.id === stopId));
  const relatedJob = useFieldDataStore((state) => state.jobs.find((job) => job.stopId === stopId));
  const advanceStopStatus = useFieldDataStore((state) => state.advanceStopStatus);
  const podDraft = useFieldDataStore((state) => state.podDrafts.find((draft) => draft.stopId === stopId));
  const latestVerification = useFieldDataStore((state) =>
    state.scanVerifications.find((record) => record.stopId === stopId),
  );

  if (!stop) {
    return (
      <section className="panel p-5 text-sm text-stone-600">
        Stop not found. Return to assigned jobs and reopen the item from the live list.
      </section>
    );
  }

  const workflow = workflowConfig[stop.workflowStage];
  const hasPodRequirements = Boolean(stop.podRequirements);
  const hasVerification = workflow.verificationEnabled && stop.verificationCodes.length > 0;
  const isActive = stop.status === "assigned" || stop.status === "in_progress";
  const isClosed = stop.status === "completed" || stop.status === "failed" || stop.status === "exception";

  return (
    <section className="space-y-6">
      <BackLink to="/jobs" label="Back to assigned jobs" />
      <ScreenHeader
        title={stop.title}
        subtitle="The available actions on this screen are driven by the assigned workflow stage for this job."
        kicker={`Stop ${stop.sequence}`}
        action={<StatusPill label={stopStatusLabel[stop.status]} tone={stopStatusTone[stop.status]} />}
      />

      <article className="panel p-5">
        <p className="tiny-label">Workflow stage</p>
        <h2 className="mt-2 text-xl font-semibold text-ink">{workflowStageLabel[stop.workflowStage]}</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">{workflow.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {workflow.capabilities.map((capability) => (
            <span key={capability} className="chip-btn">
              {capability}
            </span>
          ))}
        </div>
      </article>

      <article className="panel p-5">
        <div className="space-y-4">
          <div>
            <p className="tiny-label">Location</p>
            <p className="mt-2 text-lg font-semibold text-ink">{stop.address}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="tiny-label">Contact</p>
              <p className="mt-2 text-stone-700">{stop.contactName ?? "Not assigned"}</p>
              <p className="text-stone-500">{stop.contactPhone ?? "No phone saved"}</p>
            </div>
            <div>
              <p className="tiny-label">Window</p>
              <p className="mt-2 text-stone-700">{stop.etaLabel}</p>
              <p className="text-stone-500">{formatTimestamp(stop.updatedAt)}</p>
            </div>
          </div>
          <div>
            <p className="tiny-label">Instructions</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">{stop.instructions ?? "No special notes for this stop."}</p>
          </div>
        </div>
      </article>

      {relatedJob ? (
        <article className="panel p-5">
          <p className="tiny-label">Assigned job</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">{relatedJob.shipmentId}</h2>
          <p className="mt-2 text-sm text-stone-600">{relatedJob.instructions ?? "No shipment-specific notes."}</p>
        </article>
      ) : null}

      {hasVerification ? (
        <article className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tiny-label">Verification status</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                {latestVerification ? latestVerification.result : "Awaiting verification"}
              </h2>
            </div>
            {latestVerification ? (
              <StatusPill label={latestVerification.result} tone={scanResultTone[latestVerification.result]} />
            ) : null}
          </div>
          <div className="mt-4 space-y-2">
            {stop.verificationCodes.map((code) => (
              <div key={code.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3 text-sm">
                <p className="tiny-label">
                  {verificationTargetLabel[code.target]} - {code.codeType}
                </p>
                <p className="mt-1 font-medium text-ink">{code.value}</p>
              </div>
            ))}
          </div>
          {isActive ? (
            <Link to={`/verify?stopId=${stop.id}`} className="secondary-btn mt-4 w-full">
              Open verification
            </Link>
          ) : null}
        </article>
      ) : null}

      {hasPodRequirements ? (
        <article className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tiny-label">Confirmation capture</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                {podDraft ? "Draft in progress" : "Not captured yet"}
              </h2>
            </div>
            {podDraft ? (
              <StatusPill label={podDraft.state} tone={podDraft.state === "uploaded" ? "success" : "warning"} />
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {stop.podRequirements?.recipientName ? <span className="chip-btn">Recipient</span> : null}
            {stop.podRequirements?.otp ? <span className="chip-btn">OTP</span> : null}
            {stop.podRequirements?.signature ? <span className="chip-btn">Signature</span> : null}
            {stop.podRequirements?.photo ? <span className="chip-btn">Photo</span> : null}
          </div>
          {stop.status === "in_progress" ? (
            <Link to={`/stops/${stop.id}/pod`} className="primary-btn mt-4 w-full">
              {podDraft ? "Resume confirmation" : workflow.proofLabel ?? "Capture confirmation"}
            </Link>
          ) : null}
        </article>
      ) : null}

      <article className="panel p-5">
        <p className="tiny-label">Operational actions</p>
        <div className="mt-4 grid gap-3">
          {stop.status === "assigned" ? (
            <button type="button" className="primary-btn w-full" onClick={() => advanceStopStatus(stop.id, "in_progress")}>
              {workflow.startLabel}
            </button>
          ) : null}
          {stop.status === "in_progress" && !hasPodRequirements ? (
            <button type="button" className="primary-btn w-full" onClick={() => advanceStopStatus(stop.id, "completed")}>
              {workflow.completeLabel}
            </button>
          ) : null}
          {isActive && workflow.locationEnabled ? (
            <Link to="/location" className="secondary-btn w-full">
              Capture location update
            </Link>
          ) : null}
          {isActive ? (
            <button type="button" className="danger-btn w-full" onClick={() => advanceStopStatus(stop.id, "exception")}>
              Flag exception
            </button>
          ) : null}
          {isClosed ? (
            <Link to="/sync" className="secondary-btn w-full">
              Review sync queue
            </Link>
          ) : null}
        </div>
      </article>
    </section>
  );
};
