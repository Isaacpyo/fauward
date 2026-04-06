import { AlertTriangle } from "lucide-react";

import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentState } from "@/types/domain";

type TrackingExceptionBannerProps = {
  status: ShipmentState;
  reason?: string;
};

export function ExceptionBanner({ status, reason }: TrackingExceptionBannerProps) {
  if (status !== "FAILED_DELIVERY" && status !== "EXCEPTION" && status !== "RETURNED" && status !== "CANCELLED") {
    return null;
  }

  const tenant = useTenantStore((state) => state.tenant);
  const supportText = tenant?.name ?? "the carrier";

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="text-amber-900" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900">
            Update: {status.replaceAll("_", " ")}
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            {reason ?? "This shipment needs additional handling."}
          </p>
          <p className="mt-2 text-sm text-amber-800">Contact {supportText} for assistance.</p>
        </div>
      </div>
    </section>
  );
}
