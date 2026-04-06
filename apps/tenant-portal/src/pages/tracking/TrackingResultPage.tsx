import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { api } from "@/lib/api";
import type { TrackingResult } from "@/types/tracking";
import type { ShipmentState } from "@/types/domain";

const fallbackTrackingResult = (trackingNumber: string): TrackingResult => {
  const failed = trackingNumber.toLowerCase().includes("fail");
  const delivered = trackingNumber.toLowerCase().includes("done");
  const status: ShipmentState = failed
    ? "FAILED_DELIVERY"
    : delivered
      ? "DELIVERED"
      : "OUT_FOR_DELIVERY";

  const now = Date.now();
  return {
    tracking_number: trackingNumber,
    status,
    origin_city: "Lagos",
    destination_city: "London",
    estimated_delivery_date: new Date(now + 1000 * 60 * 60 * 8).toISOString(),
    delivered_at: delivered ? new Date(now - 1000 * 60 * 30).toISOString() : undefined,
    service_tier: "Express",
    events: [
      {
        id: "e1",
        status,
        description:
          status === "FAILED_DELIVERY"
            ? "Delivery attempt failed"
            : status === "DELIVERED"
              ? "Shipment delivered"
              : "Out for delivery",
        location: "London",
        timestamp: new Date(now - 1000 * 60 * 45).toISOString()
      },
      {
        id: "e2",
        status: "IN_TRANSIT",
        description: "Shipment arrived at destination hub",
        location: "London Hub",
        timestamp: new Date(now - 1000 * 60 * 60 * 5).toISOString()
      },
      {
        id: "e3",
        status: "PICKED_UP",
        description: "Shipment picked up",
        location: "Lagos",
        timestamp: new Date(now - 1000 * 60 * 60 * 12).toISOString()
      },
      {
        id: "e4",
        status: "PROCESSING",
        description: "Shipment created",
        timestamp: new Date(now - 1000 * 60 * 60 * 18).toISOString()
      }
    ],
    exception_reason: failed ? "Recipient unavailable at delivery address." : undefined,
    pod_photo_url: delivered ? "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?w=500" : undefined,
    signature_url: delivered ? "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500" : undefined,
    support_email: "support@tenant.com",
    support_phone: "+44 20 7946 0000"
  };
};

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

  const data = useMemo(() => liveData ?? query.data ?? fallbackTrackingResult(decodedNumber), [decodedNumber, liveData, query.data]);

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

      {query.isLoading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : (
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
      )}

      <PoweredByFooter />
    </div>
  );
}
