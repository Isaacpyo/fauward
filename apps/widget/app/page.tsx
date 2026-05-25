"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CreateShipmentForm from "@/components/shipments/CreateShipmentForm";

function WidgetPageContent() {
  const params = useSearchParams();
  const tenantSlug = params.get("tenant") ?? undefined;
  const widgetToken = params.get("token") ?? undefined;

  function handleCreated(trackingRef: string) {
    // postMessage is already fired inside CreateShipmentForm
    void trackingRef;
  }

  return (
    <div className="min-h-screen bg-white">
      <CreateShipmentForm
        embedded
        tenantSlug={tenantSlug}
        widgetToken={widgetToken}
        onCreated={handleCreated}
        onTrack={handleCreated}
      />
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <WidgetPageContent />
    </Suspense>
  );
}
