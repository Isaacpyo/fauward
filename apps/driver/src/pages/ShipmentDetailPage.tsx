import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { useDriverStore } from "@/stores/useDriverStore";

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "DELIVERED") {
    return "success";
  }
  if (status === "FAILED_DELIVERY" || status === "EXCEPTION") {
    return "danger";
  }
  if (status === "OUT_FOR_DELIVERY") {
    return "warning";
  }
  return "neutral";
}

export function ShipmentDetailPage() {
  const navigate = useNavigate();
  const { stopId = "", id = "" } = useParams();
  const stop = useDriverStore((state) => state.stops.find((item) => item.id === stopId));
  const shipment = stop?.shipments.find((item) => item.id === id);

  if (!stop || !shipment) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <p className="text-sm text-gray-600">Shipment not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
        <ArrowLeft size={16} />
        Back
      </button>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <p className="mono text-xl font-semibold text-gray-900">{shipment.trackingNumber}</p>
        <div className="mt-2">
          <Badge tone={statusTone(shipment.status)}>{shipment.status}</Badge>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4 text-sm text-gray-700">
        <p>
          <span className="font-semibold">Weight:</span> {shipment.weightKg} kg
        </p>
        <p className="mt-1">
          <span className="font-semibold">Dimensions:</span> {shipment.dimensionsCm} cm
        </p>
        <p className="mt-1">
          <span className="font-semibold">Quantity:</span> {shipment.quantity}
        </p>
      </section>

      {shipment.specialInstructions ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Special instructions</p>
          <p className="mt-1">{shipment.specialInstructions}</p>
        </section>
      ) : null}

      {shipment.customerNotes ? (
        <section className="rounded-xl border border-[var(--border-color)] bg-white p-4 text-sm text-gray-700">
          <p className="font-semibold">Customer notes</p>
          <p className="mt-1">{shipment.customerNotes}</p>
        </section>
      ) : null}

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Timeline</h2>
        <ul className="mt-3 space-y-2">
          {shipment.timeline.slice(0, 3).map((event) => (
            <li key={event.id} className="flex items-start gap-2 text-sm">
              <span className="mt-1 h-2 w-2 rounded-full bg-[var(--tenant-primary)]" />
              <div>
                <p className="font-medium text-gray-900">{event.label}</p>
                <p className="text-xs text-gray-500">{new Date(event.at).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

