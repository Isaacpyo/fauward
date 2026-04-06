import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/Button";
import type { ShipmentTimelineEvent as ShipmentTimelineEventModel } from "@/types/shipment";
import { ShipmentTimelineEvent } from "@/components/shipments/ShipmentTimelineEvent";

type ShipmentTimelineProps = {
  events: ShipmentTimelineEventModel[];
  onUpdateStatus: () => void;
};

export function ShipmentTimeline({ events, onUpdateStatus }: ShipmentTimelineProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
        <Button variant="secondary" size="sm" rightIcon={<ArrowRight size={14} />} onClick={onUpdateStatus}>
          Update Status
        </Button>
      </div>

      <div className="space-y-3">
        {events.map((event, index) => (
          <ShipmentTimelineEvent key={event.id} event={event} isLatest={index === 0} />
        ))}
      </div>
    </div>
  );
}
