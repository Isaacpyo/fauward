import type { TrackingResult } from "@/types/tracking";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

type TrackingSummaryCardProps = {
  result: TrackingResult;
};

export function TrackingSummaryCard({ result }: TrackingSummaryCardProps) {
  const tenant = useTenantStore((state) => state.tenant);
  const delivered = result.status === "DELIVERED";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-base font-semibold text-gray-900">Shipment summary</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-gray-500">Route</dt>
          <dd className="font-medium text-gray-900">
            {result.origin_city}
            {" -> "}
            {result.destination_city}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">
            {delivered ? "Delivered on" : "Estimated delivery"}
          </dt>
          <dd className="font-medium text-gray-900">
            {formatDateTime(
              delivered ? result.delivered_at ?? new Date().toISOString() : result.estimated_delivery_date ?? new Date().toISOString(),
              tenant
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Service tier</dt>
          <dd className="font-medium text-gray-900">{result.service_tier}</dd>
        </div>
      </dl>
    </section>
  );
}
