import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { ApiError } from "@/lib/api/http";
import { fieldApi, type PermissionRequestStub, type ScanLookupResult } from "@/lib/api/fieldApi";
import { useBarcodeScanner } from "@/lib/scanning/useBarcodeScanner";
import { useAuthStore } from "@/store/useAuthStore";

type RequestState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "pending"; request: PermissionRequestStub }
  | { kind: "error"; message: string };

const Spinner = ({ className = "" }: { className?: string }) => (
  <span
    aria-hidden
    className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white ${className}`}
  />
);

export const QrScanScreen = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);

  const [manualCode, setManualCode] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanLookupResult | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ kind: "idle" });
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const performLookup = useCallback(
    async (rawValue: string) => {
      const trackingNumber = rawValue.trim().toUpperCase();
      if (!trackingNumber) {
        return;
      }

      if (!accessToken) {
        setLookupError("Sign in again to scan shipments.");
        return;
      }

      setIsLookingUp(true);
      setLookupError(null);
      setManualCode(trackingNumber);
      setRequestState({ kind: "idle" });
      setNoteOpen(false);
      setNote("");

      try {
        const lookup = await fieldApi.lookupScannedShipment(accessToken, trackingNumber);
        setResult(lookup);
        if (lookup.existingRequest) {
          setRequestState({
            kind: "pending",
            request: { id: lookup.existingRequest.id, status: "PENDING" },
          });
        }
      } catch (error) {
        const message =
          error instanceof ApiError && error.status === 404
            ? "No shipment in this tenant matches that code."
            : error instanceof Error
              ? error.message
              : "Lookup failed. Try again.";
        setLookupError(message);
        setResult(null);
      } finally {
        setIsLookingUp(false);
      }
    },
    [accessToken],
  );

  const { videoRef, isCameraOpen, cameraError, startCamera, stopCamera } = useBarcodeScanner({
    formats: ["qr_code", "code_128", "ean_13"],
    onDetect: (value) => {
      void performLookup(value);
    },
  });

  // Auto-start camera on mount; gracefully fall back if denied.
  useEffect(() => {
    void startCamera();
    // intentionally only on mount — startCamera is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If a ref was passed via ?ref=, kick off a lookup right away.
  useEffect(() => {
    const initial = searchParams.get("ref");
    if (initial) {
      void performLookup(initial);
    }
    // only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void performLookup(manualCode);
  };

  const handleRequestPermission = async () => {
    if (!accessToken || !result) return;
    setRequestState({ kind: "submitting" });
    try {
      const request = await fieldApi.requestShipmentPermission(accessToken, {
        shipmentId: result.shipment.id,
        note: note.trim() ? note.trim() : undefined,
      });
      setRequestState({ kind: "pending", request });
      setNoteOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit request.";
      setRequestState({ kind: "error", message });
    }
  };

  const handleCancelRequest = async () => {
    if (!accessToken || requestState.kind !== "pending") return;
    setIsCancelling(true);
    try {
      await fieldApi.cancelPermissionRequest(accessToken, requestState.request.id);
      setRequestState({ kind: "idle" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not cancel request.";
      setRequestState({ kind: "error", message });
    } finally {
      setIsCancelling(false);
    }
  };

  const shipment = result?.shipment ?? null;
  const canRescan = !isCameraOpen && !isLookingUp;

  return (
    <section className="space-y-6">
      <BackLink to="/jobs" label="Back to assigned jobs" />
      <ScreenHeader
        title="Scan shipment"
        subtitle="Point the camera at a label or QR code to look up any shipment in your tenant."
        kicker="Universal scan"
      />

      <article className="panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="tiny-label">Live scan</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Camera</h2>
          </div>
          <button
            type="button"
            className="secondary-btn px-3 py-2 text-xs"
            onClick={isCameraOpen ? stopCamera : () => void startCamera()}
          >
            {isCameraOpen ? "Stop camera" : "Start camera"}
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-stone-300 bg-stone-950">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
        </div>
        {cameraError ? <p className="mt-3 text-sm text-amber-700">{cameraError}</p> : null}
      </article>

      <article className="panel p-5">
        <p className="tiny-label">Manual entry</p>
        <form className="mt-4 space-y-4" onSubmit={handleManualSubmit}>
          <input
            className="field-input"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="Tracking number"
            autoComplete="off"
            autoCapitalize="characters"
            inputMode="text"
          />
          <button
            type="submit"
            className="primary-btn flex w-full items-center justify-center gap-2"
            disabled={isLookingUp || !manualCode.trim()}
          >
            {isLookingUp ? <Spinner /> : null}
            {isLookingUp ? "Looking up…" : "Look up shipment"}
          </button>
        </form>
        {lookupError ? <p className="mt-3 text-sm text-amber-700">{lookupError}</p> : null}
      </article>

      {shipment ? (
        <article className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="tiny-label">{shipment.currentStop?.type ?? "Shipment"}</p>
              <h2 className="mt-2 text-lg font-semibold text-ink">{shipment.trackingNumber}</h2>
            </div>
            <StatusPill label={shipment.status} tone="neutral" />
          </div>

          <dl className="mt-4 space-y-2 text-sm text-stone-700">
            <div className="flex justify-between gap-3">
              <dt className="tiny-label">Recipient</dt>
              <dd className="text-right text-ink">{shipment.recipientName ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="tiny-label">Assigned driver</dt>
              <dd className="text-right text-ink">
                {shipment.assignedDriver ? shipment.assignedDriver.name : "Unassigned"}
              </dd>
            </div>
            {shipment.currentStop ? (
              <div className="flex justify-between gap-3">
                <dt className="tiny-label">Stop</dt>
                <dd className="text-right text-ink">
                  #{shipment.currentStop.sequence} · {shipment.currentStop.type}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-5 space-y-3">
            {shipment.isAssignedToMe ? (
              <button
                type="button"
                className="primary-btn w-full"
                onClick={() =>
                  shipment.currentStop
                    ? navigate(`/stops/${shipment.currentStop.id}`)
                    : navigate("/jobs")
                }
              >
                Open in jobs
              </button>
            ) : requestState.kind === "pending" ? (
              <>
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  Permission request pending — a manager has been notified.
                </div>
                <button
                  type="button"
                  className="secondary-btn flex w-full items-center justify-center gap-2"
                  onClick={() => void handleCancelRequest()}
                  disabled={isCancelling}
                >
                  {isCancelling ? <Spinner className="border-stone-400/40 border-t-stone-700" /> : null}
                  {isCancelling ? "Cancelling…" : "Cancel request"}
                </button>
              </>
            ) : noteOpen ? (
              <>
                <textarea
                  className="field-input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional note for the manager (e.g. 'I'm at the warehouse now')"
                  rows={3}
                  maxLength={500}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="secondary-btn flex-1"
                    onClick={() => {
                      setNoteOpen(false);
                      setNote("");
                    }}
                    disabled={requestState.kind === "submitting"}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-btn flex flex-1 items-center justify-center gap-2"
                    onClick={() => void handleRequestPermission()}
                    disabled={requestState.kind === "submitting"}
                  >
                    {requestState.kind === "submitting" ? <Spinner /> : null}
                    {requestState.kind === "submitting" ? "Sending…" : "Send request"}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="primary-btn w-full" onClick={() => setNoteOpen(true)}>
                Request permission to handle
              </button>
            )}

            {requestState.kind === "error" ? (
              <p className="text-sm text-amber-700">{requestState.message}</p>
            ) : null}
          </div>

          {canRescan ? (
            <button
              type="button"
              className="mt-5 text-xs text-stone-500 underline"
              onClick={() => {
                setResult(null);
                setLookupError(null);
                setManualCode("");
                setRequestState({ kind: "idle" });
                void startCamera();
              }}
            >
              Scan another shipment
            </button>
          ) : null}
        </article>
      ) : null}
    </section>
  );
};
