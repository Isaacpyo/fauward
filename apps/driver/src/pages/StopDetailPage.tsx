import { ArrowLeft, MapPin, Phone } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ShipmentCard } from "@/components/driver/ShipmentCard";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useDriverStore } from "@/stores/useDriverStore";

export function StopDetailPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const stop = useDriverStore((state) => state.stops.find((item) => item.id === id));

  if (!stop) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <p className="text-sm text-gray-600">Stop not found.</p>
        <Button variant="secondary" onClick={() => navigate("/route")} className="mt-3">
          Back to route
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-44">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <h1 className="text-lg font-semibold text-gray-900">{stop.customerName}</h1>
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-start gap-2 text-sm text-gray-700">
          <MapPin size={16} className="mt-0.5 shrink-0" />
          <span>{stop.address}</span>
        </a>
        <a href={`tel:${stop.phone}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--tenant-primary)]">
          <Phone size={16} />
          {stop.phone}
        </a>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Shipments</h2>
        {stop.shipments.map((shipment) => (
          <ShipmentCard key={shipment.id} stopId={stop.id} shipment={shipment} />
        ))}
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Notes</h3>
        <Textarea placeholder="Add route notes..." />
      </section>

      <div className="fixed inset-x-0 bottom-16 z-30 space-y-2 border-t border-[var(--border-color)] bg-white px-4 py-3">
        <Link to={`/route/stop/${stop.id}/pod`}>
          <Button variant="success">Delivered</Button>
        </Link>
        <Link to={`/route/stop/${stop.id}/failed`}>
          <Button variant="outline-danger">Failed Delivery</Button>
        </Link>
        <Button variant="outline-warning">Exception</Button>
      </div>
    </div>
  );
}

