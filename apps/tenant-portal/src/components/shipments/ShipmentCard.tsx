import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentListItem } from "@/types/shipment";

type ShipmentCardProps = {
  shipment: ShipmentListItem;
};

export function ShipmentCard({ shipment }: ShipmentCardProps) {
  const tenant = useTenantStore((state) => state.tenant);

  return (
    <Link
      to={`/shipments/${shipment.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold text-gray-900">{shipment.tracking_number}</p>
          <p className="mt-1 text-sm text-gray-700">{shipment.customer_name}</p>
        </div>
        <ChevronRight size={16} className="text-gray-400" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <StatusBadge status={shipment.status} />
        <p className="text-xs text-gray-500">{formatDateTime(shipment.created_at, tenant)}</p>
      </div>
      <p className="mt-2 text-sm text-gray-600">{shipment.destination}</p>
    </Link>
  );
}
