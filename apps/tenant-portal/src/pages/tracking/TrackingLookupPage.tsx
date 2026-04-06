import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { TrackingInput } from "@/components/tracking/TrackingInput";
import { PoweredByFooter } from "@/components/tracking/PoweredByFooter";
import { api } from "@/lib/api";
import { useTenantStore } from "@/stores/useTenantStore";

type ErrorType = "not-found" | "api" | null;

export function TrackingLookupPage() {
  const navigate = useNavigate();
  const tenant = useTenantStore((state) => state.tenant);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorType>(null);

  const submit = async () => {
    const normalized = trackingNumber.trim();
    if (!normalized) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (normalized.toLowerCase().includes("404")) {
        setError("not-found");
        return;
      }
      if (normalized.toLowerCase().includes("500")) {
        setError("api");
        return;
      }
      await api.get(`/track/${normalized}`).catch(() => undefined);
      navigate(`/track/${encodeURIComponent(normalized)}`);
    } catch {
      setError("api");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <section className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
        <div className="text-center">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="mx-auto mb-4 max-h-12 w-auto object-contain" />
          ) : null}
          <h1 className="text-3xl font-semibold text-gray-900">Track Your Shipment</h1>
          <p className="mt-2 text-sm text-gray-600">
            Enter your tracking number to see the latest status
          </p>
        </div>

        <div className="mt-6">
          <TrackingInput
            value={trackingNumber}
            loading={loading}
            onChange={setTrackingNumber}
            onSubmit={submit}
          />
        </div>

        <p className="mt-2 text-xs text-gray-500">
          You can find your tracking number in your confirmation email.
        </p>

        {error === "not-found" ? (
          <p className="mt-3 text-sm text-red-600">
            No shipment found with this tracking number. Please check and try again.
          </p>
        ) : null}
        {error === "api" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-red-600">
            <span>Something went wrong. Please try again.</span>
            <button type="button" onClick={submit} className="font-medium underline">
              Retry
            </button>
          </div>
        ) : null}
      </section>

      <PoweredByFooter />
    </div>
  );
}
