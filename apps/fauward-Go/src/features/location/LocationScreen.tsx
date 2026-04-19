import { useCallback, useEffect, useState } from "react";
import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { appEnv } from "@/lib/config/env";
import { formatTimestamp } from "@/lib/utils/formatters";
import { useFieldDataStore } from "@/store/useFieldDataStore";

export const LocationScreen = () => {
  const locationPings = useFieldDataStore((state) => state.locationPings);
  const addLocationPing = useFieldDataStore((state) => state.addLocationPing);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureLocationNow = useCallback(() => {
    if (!appEnv.enableLocation) {
      setError("Location capture is disabled by environment configuration.");
      return;
    }

    if (!("geolocation" in navigator)) {
      addLocationPing({
        lat: 6.5244,
        lng: 3.3792,
        accuracy: 12,
        source: "manual",
      });
      setError("Browser geolocation is unavailable. A simulated field ping was queued instead.");
      return;
    }

    setRequesting(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        addLocationPing({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: "gps",
        });
        setRequesting(false);
      },
      (positionError) => {
        setRequesting(false);
        setError(positionError.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 15000,
      },
    );
  }, [addLocationPing]);

  useEffect(() => {
    if (!trackingEnabled) {
      return;
    }

    captureLocationNow();

    const timer = window.setInterval(() => {
      captureLocationNow();
    }, appEnv.locationIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [captureLocationNow, trackingEnabled]);

  const latestLocation = locationPings[0];

  return (
    <section className="space-y-6">
      <BackLink to="/jobs" label="Back to assigned jobs" />
      <ScreenHeader
        title="Location telemetry"
        subtitle="Pings are stored locally and queued for sync so tracking survives weak connectivity."
        kicker="Field tracking"
      />

      <article className="panel-accent p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="tiny-label text-brand">Tracking mode</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              {trackingEnabled ? "Periodic capture enabled" : "Manual capture"}
            </h2>
          </div>
          <StatusPill label={trackingEnabled ? "tracking" : "standby"} tone={trackingEnabled ? "success" : "neutral"} />
        </div>
        <div className="mt-5 grid gap-3">
          <button type="button" className="primary-btn w-full" onClick={captureLocationNow} disabled={requesting}>
            {requesting ? "Capturing location..." : "Capture location now"}
          </button>
          <button
            type="button"
            className="secondary-btn w-full"
            onClick={() => setTrackingEnabled((current) => !current)}
          >
            {trackingEnabled ? "Stop periodic tracking" : "Start periodic tracking"}
          </button>
        </div>
      </article>

      {error ? <p className="text-sm text-amber-700">{error}</p> : null}

      {latestLocation ? (
        <article className="panel p-5">
          <p className="tiny-label">Latest ping</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-stone-600">
            <div>
              <p className="tiny-label">Coordinates</p>
              <p className="mt-2 text-ink">
                {latestLocation.lat.toFixed(5)}, {latestLocation.lng.toFixed(5)}
              </p>
            </div>
            <div>
              <p className="tiny-label">Accuracy</p>
              <p className="mt-2 text-ink">
                {latestLocation.accuracy ? `${Math.round(latestLocation.accuracy)} m` : "Unknown"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-stone-500">Captured {formatTimestamp(latestLocation.createdAt)}</p>
        </article>
      ) : null}

      <div className="space-y-3">
        {locationPings.map((ping) => (
          <article key={ping.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="tiny-label">{ping.source === "gps" ? "GPS ping" : "Manual ping"}</p>
                <h2 className="mt-2 text-lg font-semibold text-ink">
                  {ping.lat.toFixed(5)}, {ping.lng.toFixed(5)}
                </h2>
                <p className="mt-2 text-sm text-stone-500">{formatTimestamp(ping.createdAt)}</p>
              </div>
              <StatusPill label={ping.synced ? "synced" : "queued"} tone={ping.synced ? "success" : "warning"} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
