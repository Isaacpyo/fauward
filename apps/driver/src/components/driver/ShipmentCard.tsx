import { Link } from "react-router-dom";

import type { DriverShipment } from "@/stores/useDriverStore";

type ShipmentCardProps = {
  stopId: string;
  shipment: DriverShipment;
};

export function ShipmentCard({ stopId, shipment }: ShipmentCardProps) {
  return (
    <Link
      to={`/route/stop/${stopId}/shipment/${shipment.id}`}
      className="block rounded-xl border border-[var(--border-color)] bg-white p-3"
    >
      <p className="mono text-sm font-semibold text-gray-900">{shipment.trackingNumber}</p>
      <p className="mt-1 text-sm text-gray-700">{shipment.description}</p>
      <p className="mt-2 text-xs text-gray-500">{shipment.status}</p>
    </Link>
  );
}

