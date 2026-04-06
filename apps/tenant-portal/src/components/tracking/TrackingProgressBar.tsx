import { AlertTriangle } from "lucide-react";

import { SHIPMENT_PROGRESS_STEPS } from "@/lib/shipment-state";
import type { ShipmentState } from "@/types/domain";
import { cn } from "@/lib/utils";

type TrackingProgressBarProps = {
  status: ShipmentState;
};

const divergedStates: ShipmentState[] = [
  "FAILED_DELIVERY",
  "RETURNED",
  "CANCELLED",
  "EXCEPTION"
];

function getCurrentProgressIndex(status: ShipmentState): number {
  if (status === "FAILED_DELIVERY" || status === "EXCEPTION") {
    return SHIPMENT_PROGRESS_STEPS.indexOf("OUT_FOR_DELIVERY");
  }
  if (status === "RETURNED" || status === "CANCELLED") {
    return SHIPMENT_PROGRESS_STEPS.indexOf("IN_TRANSIT");
  }
  const index = SHIPMENT_PROGRESS_STEPS.indexOf(status);
  return index >= 0 ? index : 0;
}

export function TrackingProgressBar({ status }: TrackingProgressBarProps) {
  const currentIndex = getCurrentProgressIndex(status);
  const diverged = divergedStates.includes(status);

  return (
    <div className="space-y-2 overflow-x-auto">
      <div className="flex min-w-[640px] items-center gap-2">
        {SHIPMENT_PROGRESS_STEPS.map((step, index) => {
          const completed = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <div key={step} className="flex flex-1 items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "inline-flex h-4 w-4 rounded-full border",
                    completed
                      ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary)]"
                      : isCurrent
                        ? "animate-pulse border-[var(--tenant-primary)] bg-white"
                        : "border-gray-300 bg-white"
                  )}
                />
                <span className="whitespace-nowrap text-[10px] font-medium text-gray-600">
                  {step.replaceAll("_", " ")}
                </span>
              </div>
              {index < SHIPMENT_PROGRESS_STEPS.length - 1 ? (
                <span
                  className={cn(
                    "h-[2px] flex-1",
                    completed ? "bg-[var(--tenant-primary)]" : "bg-gray-300"
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {diverged ? (
        <div className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle size={13} />
          Divergence: shipment moved to {status.replaceAll("_", " ")}
        </div>
      ) : null}
    </div>
  );
}
