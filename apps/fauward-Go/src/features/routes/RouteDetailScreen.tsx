import { Link, useParams } from "react-router-dom";
import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { stopStatusLabel, stopStatusTone, workflowStageLabel } from "@/types/field";

export const RouteDetailScreen = () => {
  const { routeId } = useParams();
  const route = useFieldDataStore((state) => state.routes.find((item) => item.id === routeId));
  const stops = useFieldDataStore((state) =>
    state.stops
      .filter((stop) => stop.routeId === routeId)
      .sort((left, right) => left.sequence - right.sequence),
  );

  if (!route) {
    return (
      <section className="panel p-5 text-sm text-stone-600">
        Route not found. Return to assigned jobs and reopen the job.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <BackLink to="/jobs" label="Back to assigned jobs" />
      <ScreenHeader
        title={route.label}
        subtitle={`Area ${route.area}. Vehicle ${route.vehicleLabel}. Shift ${route.shiftWindow}.`}
        kicker="Assigned flow"
      />

      <article className="panel-accent p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="tiny-label text-brand">Route sequence</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">{stops.length} planned stops</h2>
          </div>
          <Link to="/jobs" className="secondary-btn">
            All jobs
          </Link>
        </div>
      </article>

      <div className="space-y-3">
        {stops.map((stop) => (
          <Link key={stop.id} to={`/stops/${stop.id}`} className="action-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="tiny-label">
                  Stop {stop.sequence} - {workflowStageLabel[stop.workflowStage]}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-ink">{stop.title}</h2>
                <p className="mt-1 text-sm text-stone-600">{stop.address}</p>
                <p className="mt-3 text-sm text-stone-500">
                  ETA {stop.etaLabel} - {stop.packageCount} packages
                </p>
              </div>
              <StatusPill label={stopStatusLabel[stop.status]} tone={stopStatusTone[stop.status]} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};
