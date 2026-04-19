"use client";

import { useSearchParams } from "next/navigation";
import CreateShipmentForm from "@/components/shipments/CreateShipmentForm";

export default function WidgetPage() {
  const params = useSearchParams();
  const tenantSlug = params.get("tenant") ?? undefined;

  function handleCreated(trackingRef: string) {
    // postMessage is already fired inside CreateShipmentForm
    console.log("[WIDGET] Shipment created:", trackingRef);
  }

  return (
    <div className="min-h-screen bg-white">
      <CreateShipmentForm
        embedded
        tenantSlug={tenantSlug}
        onCreated={handleCreated}
        onTrack={handleCreated}
      />
    </div>
  );
}
