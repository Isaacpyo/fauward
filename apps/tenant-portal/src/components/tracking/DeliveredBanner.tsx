import { CheckCircle2 } from "lucide-react";

import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

type DeliveredBannerProps = {
  deliveredAt: string;
  podPhotoUrl?: string;
  signatureUrl?: string;
};

export function DeliveredBanner({
  deliveredAt,
  podPhotoUrl,
  signatureUrl
}: DeliveredBannerProps) {
  const tenant = useTenantStore((state) => state.tenant);

  return (
    <section className="rounded-lg border border-green-300 bg-green-50 p-4">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={18} className="text-green-700" />
        <div>
          <h3 className="text-sm font-semibold text-green-800">Your shipment has been delivered</h3>
          <p className="mt-1 text-sm text-green-700">
            Delivered on {formatDateTime(deliveredAt, tenant)}
          </p>
        </div>
      </div>
      {(podPhotoUrl || signatureUrl) ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {podPhotoUrl ? (
            <a href={podPhotoUrl} target="_blank" rel="noreferrer" className="block rounded-md border border-green-200 bg-white p-2">
              <img src={podPhotoUrl} alt="Proof of delivery" className="h-36 w-full rounded object-cover" />
              <p className="mt-1 text-xs text-gray-600">POD photo</p>
            </a>
          ) : null}
          {signatureUrl ? (
            <a href={signatureUrl} target="_blank" rel="noreferrer" className="block rounded-md border border-green-200 bg-white p-2">
              <img src={signatureUrl} alt="Delivery signature" className="h-36 w-full rounded object-contain" />
              <p className="mt-1 text-xs text-gray-600">Signature</p>
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
