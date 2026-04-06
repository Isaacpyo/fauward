import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

import { TrackingNumber } from "@/components/shared/TrackingNumber";
import { Button } from "@/components/ui/Button";

type ShipmentSuccessStateProps = {
  trackingNumber: string;
  onCreateAnother: () => void;
};

export function ShipmentSuccessState({
  trackingNumber,
  onCreateAnother
}: ShipmentSuccessStateProps) {
  return (
    <section className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
      <div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 size={28} className="text-green-700" />
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-green-800">Shipment Created Successfully</h2>
      <p className="mt-2 text-sm text-green-700">Your tracking number is ready:</p>
      <div className="mt-3 flex justify-center">
        <TrackingNumber value={trackingNumber} />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to={`/shipments/${trackingNumber}`}>View Shipment</Link>
        </Button>
        <Button variant="secondary" onClick={onCreateAnother}>
          Create Another
        </Button>
      </div>
    </section>
  );
}
