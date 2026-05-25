import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { SignaturePad } from "@/components/pod/SignaturePad";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import type { WorkflowStage } from "@/types/field";

type WizardStep = "location" | "photos" | "signature";

const LOCATION_ENABLED: WorkflowStage[] = ["delivery", "return_initiation", "pickup", "linehaul", "dispatch_handoff"];
const SIGNATURE_REQUIRED: WorkflowStage[] = ["delivery", "return_initiation"];

const COMPLETE_LABEL: Record<WorkflowStage, string> = {
  shipment_creation: "Complete shipment creation",
  warehouse_intake: "Complete warehouse intake",
  dispatch_handoff: "Complete dispatch handoff",
  pickup: "Complete pickup",
  linehaul: "Complete linehaul stage",
  delivery: "Complete delivery",
  return_initiation: "Complete return collection",
  return_receipt: "Complete return receipt",
};

function buildSteps(stage: WorkflowStage): WizardStep[] {
  const steps: WizardStep[] = [];
  if (LOCATION_ENABLED.includes(stage)) steps.push("location");
  steps.push("photos");
  if (SIGNATURE_REQUIRED.includes(stage)) steps.push("signature");
  return steps;
}

type LocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "granted"; lat: number; lng: number }
  | { status: "denied"; label: string };

type AddressMatchState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "matched" }
  | { status: "nearby"; distanceM: number }
  | { status: "mismatch"; distanceM: number }
  | { status: "unknown" };

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { "User-Agent": "FauwardGo/1.0" } },
    );
    const json = (await res.json()) as { lat: string; lon: string }[];
    if (!json[0]) return null;
    return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
  } catch {
    return null;
  }
}

export const DeliveryWizardScreen = () => {
  const { stopId } = useParams();
  const navigate = useNavigate();

  // --- all hooks unconditionally at the top ---
  const stop = useFieldDataStore((state) => state.stops.find((s) => s.id === stopId));
  const relatedJob = useFieldDataStore((state) => state.jobs.find((j) => j.stopId === stopId));
  const completeDeliveryWithProof = useFieldDataStore((state) => state.completeDeliveryWithProof);

  const [stepIndex, setStepIndex] = useState(0);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [addressMatch, setAddressMatch] = useState<AddressMatchState>({ status: "idle" });
  const [manualLabel, setManualLabel] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [signature, setSignature] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const steps = stop ? buildSteps(stop.workflowStage) : ([] as WizardStep[]);
  const currentStep = steps[stepIndex] as WizardStep | undefined;
  const isLastStep = stepIndex === steps.length - 1;
  const stopAddress = stop?.address ?? "";

  const requestLocation = useCallback(() => {
    setLocation({ status: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ status: "granted", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocation({ status: "denied", label: "" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (currentStep === "location") requestLocation();
  }, [currentStep, requestLocation]);

  useEffect(() => {
    if (location.status !== "granted") return;
    const { lat, lng } = location;
    setAddressMatch({ status: "checking" });
    void geocodeAddress(stopAddress).then((coords) => {
      if (!coords) { setAddressMatch({ status: "unknown" }); return; }
      const dist = haversineMeters(lat, lng, coords.lat, coords.lng);
      if (dist <= 150) setAddressMatch({ status: "matched" });
      else if (dist <= 1500) setAddressMatch({ status: "nearby", distanceM: dist });
      else setAddressMatch({ status: "mismatch", distanceM: dist });
    });
  }, [location.status, stopAddress]);

  // --- guard after all hooks ---
  if (!stop || !stopId) {
    return (
      <section className="panel p-5 text-sm text-stone-600">
        Stop not found. Return to assigned jobs and reopen the item.
      </section>
    );
  }

  // --- confirmation screen ---
  if (done) {
    const trackingRef = relatedJob?.trackingNumber ?? stop.shipmentId;
    return (
      <section className="space-y-6">
        <article className="panel p-8 space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-ink">Delivery confirmed</h2>
            <p className="mt-1 text-sm font-medium text-stone-500">{trackingRef}</p>
          </div>
          <p className="text-sm text-stone-600">{stop.address}</p>
          <div className="rounded-2xl bg-cyan-50 border border-cyan-200 px-4 py-3 text-sm text-cyan-800 text-left">
            Syncing to the network — the dashboard will update shortly.
          </div>
          <button type="button" className="primary-btn w-full" onClick={() => navigate("/jobs")}>
            Back to jobs
          </button>
        </article>
      </section>
    );
  }

  const handlePhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          }),
      ),
    ).then((dataUrls) => setPhotos((prev) => [...prev, ...dataUrls]));
    if (event.target) event.target.value = "";
  };

  const canAdvance = (): boolean => {
    if (currentStep === "location") return true;
    if (currentStep === "photos") return photos.length > 0;
    if (currentStep === "signature") return Boolean(signature);
    return false;
  };

  const advance = () => {
    if (!isLastStep) setStepIndex((i) => i + 1);
  };

  // Synchronous completion — no photo upload blocking, base64 stored locally
  const handleComplete = () => {
    const lat = location.status === "granted" ? location.lat : undefined;
    const lng = location.status === "granted" ? location.lng : undefined;
    const locationLabel =
      location.status === "granted"
        ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
        : location.status === "denied"
          ? (manualLabel.trim() || undefined)
          : undefined;

    completeDeliveryWithProof(stopId, {
      photoRefs: photos,
      signatureRef: signature,
      lat,
      lng,
      locationLabel,
    });

    setDone(true);
  };

  const stepLabel = (step: WizardStep) => {
    if (step === "location") return "Location";
    if (step === "photos") return "Photos";
    return "Signature";
  };

  return (
    <section className="space-y-6">
      <BackLink to={`/stops/${stopId}`} label="Back to job" />
      <ScreenHeader
        title={COMPLETE_LABEL[stop.workflowStage]}
        subtitle="Complete each step to confirm the handoff."
        kicker={stop.workflowStage.replace(/_/g, " ")}
      />

      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                i < stepIndex
                  ? "bg-brand text-white"
                  : i === stepIndex
                    ? "border-2 border-brand text-brand"
                    : "border border-stone-300 text-stone-400"
              }`}
            >
              {i < stepIndex ? "✓" : i + 1}
            </div>
            <span className={`text-xs font-medium ${i === stepIndex ? "text-ink" : "text-stone-400"}`}>
              {stepLabel(step)}
            </span>
            {i < steps.length - 1 && <div className="h-px w-4 bg-stone-300" />}
          </div>
        ))}
      </div>

      {currentStep === "location" && (
        <article className="panel p-5 space-y-4">
          <div>
            <p className="tiny-label">Current location</p>
            {location.status === "idle" && <p className="mt-2 text-sm text-stone-500">Initialising GPS…</p>}
            {location.status === "requesting" && <p className="mt-2 text-sm text-stone-500">Requesting location…</p>}
            {location.status === "granted" && <p className="mt-2 text-sm text-stone-500">Location acquired.</p>}
            {location.status === "denied" && (
              <p className="mt-2 text-sm text-amber-600">
                GPS denied. Enter a label manually or proceed without it.
              </p>
            )}
          </div>

          {location.status === "granted" && (
            <div
              className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                addressMatch.status === "checking"
                  ? "bg-stone-100 text-stone-500"
                  : addressMatch.status === "matched"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : addressMatch.status === "nearby"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      : addressMatch.status === "mismatch"
                        ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                        : "bg-stone-100 text-stone-500"
              }`}
            >
              {addressMatch.status === "checking" && "Verifying against delivery address…"}
              {addressMatch.status === "matched" && <>Location confirmed — <span className="font-semibold">{stop.address}</span></>}
              {addressMatch.status === "nearby" && (
                <><span className="font-semibold">~{Math.round((addressMatch as { distanceM: number }).distanceM)}m</span> from delivery address — proceed with care.</>
              )}
              {addressMatch.status === "mismatch" && (
                <>You appear to be far from <span className="font-semibold">{stop.address}</span>. Verify before continuing.</>
              )}
              {addressMatch.status === "unknown" && "Could not verify address — proceed with care."}
            </div>
          )}

          {(location.status === "denied" || location.status === "granted") && (
            <button type="button" className="secondary-btn w-full" onClick={requestLocation}>
              Retry GPS
            </button>
          )}

          {location.status === "denied" && (
            <div>
              <label htmlFor="manual-location" className="mb-2 block tiny-label">Manual location label</label>
              <input
                id="manual-location"
                className="field-input"
                value={manualLabel}
                onChange={(e) => {
                  setManualLabel(e.target.value);
                  setLocation({ status: "denied", label: e.target.value });
                }}
                placeholder="e.g. Outside 1 Piccadilly Gardens"
              />
            </div>
          )}

          <button type="button" className="primary-btn w-full" onClick={advance}>
            Next — Capture photos
          </button>
        </article>
      )}

      {currentStep === "photos" && (
        <article className="panel p-5 space-y-4">
          <div>
            <p className="tiny-label">Delivery photos</p>
            <p className="mt-1 text-sm text-stone-600">At least one photo is required.</p>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotos} />
          {photos.length === 0 ? (
            <button type="button" className="secondary-btn w-full" onClick={() => photoInputRef.current?.click()}>
              Open camera
            </button>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt={`Photo ${i + 1}`} className="h-24 w-full rounded-xl object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="secondary-btn w-full" onClick={() => photoInputRef.current?.click()}>
                Add more photos
              </button>
            </>
          )}
          <button type="button" className="primary-btn w-full" disabled={photos.length === 0} onClick={advance}>
            {isLastStep ? "Review" : "Next — Capture signature"}
          </button>
        </article>
      )}

      {currentStep === "signature" && (
        <article className="panel p-5 space-y-4">
          <div>
            <p className="tiny-label">Recipient signature</p>
            <p className="mt-1 text-sm text-stone-600">Ask the recipient to sign below to confirm receipt.</p>
          </div>
          <SignaturePad value={signature} onChange={setSignature} />
        </article>
      )}

      {(isLastStep && canAdvance()) || steps.length === 0 ? (
        <button type="button" className="primary-btn w-full" onClick={handleComplete}>
          {COMPLETE_LABEL[stop.workflowStage]}
        </button>
      ) : null}
    </section>
  );
};
