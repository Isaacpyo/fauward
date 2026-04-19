import { MoreHorizontal } from "lucide-react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { TrackingNumber } from "@/components/shared/TrackingNumber";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import type { ShipmentDetail } from "@/types/shipment";

type ShipmentSummaryCardProps = {
  shipment: ShipmentDetail;
  onUpdateStatus: () => void;
  onAssignDriver: () => void;
  onPrintLabel: () => void;
  onCancelShipment: () => void;
};

export function ShipmentSummaryCard({
  shipment,
  onUpdateStatus,
  onAssignDriver,
  onPrintLabel,
  onCancelShipment
}: ShipmentSummaryCardProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <TrackingNumber value={shipment.tracking_number} />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={shipment.status} />
            <Badge variant="primary" className="text-sm">
              {shipment.service_tier}
            </Badge>
          </div>
        </div>
        <Dropdown
          trigger={
            <Button variant="secondary" size="sm" leftIcon={<MoreHorizontal size={14} />}>
              Actions
            </Button>
          }
          items={[
            { key: "status", label: "Update Status", onSelect: onUpdateStatus },
            { key: "assign", label: "Assign Field Operator", onSelect: onAssignDriver },
            { key: "print", label: "Print Label", onSelect: onPrintLabel },
            { key: "cancel", label: "Cancel Shipment", onSelect: onCancelShipment, destructive: true }
          ]}
        />
      </div>
    </section>
  );
}
