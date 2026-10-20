import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { io } from "socket.io-client";

import { DeliveredBanner } from "@/components/tracking/DeliveredBanner";
import { ExceptionBanner } from "@/components/tracking/ExceptionBanner";
import { PoweredByFooter } from "@/components/tracking/PoweredByFooter";
import { TrackingProgressBar } from "@/components/tracking/TrackingProgressBar";
import { TrackingSummaryCard } from "@/components/tracking/TrackingSummaryCard";
import { TrackingTimeline } from "@/components/tracking/TrackingTimeline";
import { TrackingNumber } from "@/components/shared/TrackingNumber";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { isAxiosError } from "axios";
import type { TrackingResult } from "@/types/tracking";
import type { ShipmentState } from "@/types/domain";

async function fetchTrackingResult(number: string): Promise<TrackingResult> {
  const response = await api.get<TrackingResult>(`/v1/tracking/${number}`);
  return response.data;
}

export function TrackingResultPage() {
  const { number = "" } = useParams();
  const decodedNumber = decodeURIComponent(number);
  const [liveData, setLiveData] = useState<TrackingResult | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const query = useQuery({
    queryKey: ["public-tracking", decodedNumber],
    queryFn: () => fetchTrackingResult(decodedNumber),
    staleTime: 10_000,
    retry: 1
  });

  useEffect(() => {
    if (!decodedNumber) return;

    const socket = io(window.location.origin, {
      path: "/tracking",
      transports: ["websocket"]
    });

    socket.on("connect", () => {
      setSocketConnected(true);
      socket.send({ type: "subscribe", trackingNumber: decodedNumber });
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    socket.on("message", (message: { type?: string; data?: { status?: ShipmentState; location?: unknown; timestamp?: string } }) => {
      const payload = message?.data;
      if (message?.type !== "status_update" || !payload?.status) {
        return;
      }

      setLiveData((previous) => {
        const base = previous ?? query.data;
        if (!base) return previous;
        const nextStatus: ShipmentState = payload.status ?? base.status;

        const nextEvent = {
          id: crypto.randomUUID(),
          status: nextStatus,
          description: `Status updated to ${nextStatus}`,
          location: payload.location ? JSON.stringify(payload.location) : undefined,
          timestamp: payload.timestamp ?? new Date().toISOString()
        };

        return {
          ...base,
          status: nextStatus,
          delivered_at:
            nextStatus === "DELIVERED"
              ? payload.timestamp ?? new Date().toISOString()
              : base.delivered_at,
          events: [nextEvent, ...base.events]
        };
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [decodedNumber, query.data]);

  const data = liveData ?? query.data;
  const notFound = query.isError && isAxiosError(query.error) && query.error.response?.status === 404;

  if (!decodedNumber) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
        Invalid tracking number.
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-6">
      <Link to="/track" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft size={14} />
        Track another shipment
      </Link>

      {query.isLoading && !data ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : notFound ? (
        <section className="mt-3 rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700" role="status">
          <p className="text-base font-semibold text-gray-900">Tracking number not found</p>
          <p className="mt-1">We could not find a shipment with the tracking number <span className="font-mono">{decodedNumber}</span>. Check the number and try again.</p>
        </section>
      ) : !data ? (
        <div className="mt-3">
          <ErrorState
            title="Tracking is unavailable"
            description={apiErrorMessage(query.error, "Tracking could not be loaded right now.")}
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <>
      <section className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
        <TrackingNumber value={data.tracking_number} />
        <div className="mt-3">
          <StatusBadge status={data.status} />
        </div>
        <div className="mt-4">
          <TrackingProgressBar status={data.status} />
        </div>
        {!socketConnected ? <p className="mt-3 text-xs text-amber-600">Reconnecting to live updates...</p> : null}
      </section>

        <div className="mt-4 space-y-4">
          {data.status === "DELIVERED" && data.delivered_at ? (
            <DeliveredBanner
              deliveredAt={data.delivered_at}
              podPhotoUrl={data.pod_photo_url}
              signatureUrl={data.signature_url}
            />
          ) : null}
          <ExceptionBanner status={data.status} reason={data.exception_reason} />
          <TrackingSummaryCard result={data} />
          <TrackingTimeline events={data.events} />
          {data.status !== "DELIVERED" && (data.support_email || data.support_phone) ? (
            <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
              Contact support: {" "}
              {data.support_email ? <a href={`mailto:${data.support_email}`} className="text-[var(--tenant-primary)] hover:underline">{data.support_email}</a> : null}
              {data.support_email && data.support_phone ? " . " : ""}
              {data.support_phone ? <a href={`tel:${data.support_phone}`} className="text-[var(--tenant-primary)] hover:underline">{data.support_phone}</a> : null}
            </section>
          ) : null}
        </div>
        </>
      )}

      <PoweredByFooter />
    </div>
  );
}
