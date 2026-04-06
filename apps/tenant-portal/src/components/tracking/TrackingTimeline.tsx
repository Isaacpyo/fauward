import type { TrackingEvent } from "@/types/tracking";
import { TrackingTimelineEvent } from "@/components/tracking/TrackingTimelineEvent";

type TrackingTimelineProps = {
  events: TrackingEvent[];
};

export function TrackingTimeline({ events }: TrackingTimelineProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
      {events.map((event, index) => (
        <TrackingTimelineEvent key={event.id} event={event} isLatest={index === 0} />
      ))}
    </section>
  );
}
