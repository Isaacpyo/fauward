import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { formatTimestamp } from "@/lib/utils/formatters";
import { useBarcodeScanner } from "@/lib/scanning/useBarcodeScanner";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { scanResultTone, verificationTargetLabel, workflowStageLabel, type VerificationTarget } from "@/types/field";

export const ScanVerifyScreen = () => {
  const [searchParams] = useSearchParams();
  // Subscribe to the raw stops array so Zustand returns a stable reference;
  // filtering inside the selector created a new array every render which
  // Zustand treated as a state change → infinite re-render loop.
  const allStops = useFieldDataStore((state) => state.stops);
  const stops = useMemo(
    () =>
      allStops.filter(
        (stop) =>
          (stop.status === "assigned" || stop.status === "in_progress") &&
          stop.verificationCodes.length > 0,
      ),
    [allStops],
  );
  const scanVerifications = useFieldDataStore((state) => state.scanVerifications);
  const recordScanVerification = useFieldDataStore((state) => state.recordScanVerification);
  const initialStopId = searchParams.get("stopId") ?? "";
  const initialCodeType = searchParams.get("codeType") === "qr" ? "qr" : "barcode";
  const [selectedStopId, setSelectedStopId] = useState(initialStopId);
  const resolvedStopId = stops.some((item) => item.id === selectedStopId) ? selectedStopId : (stops[0]?.id ?? "");
  const stop = stops.find((item) => item.id === resolvedStopId);
  const [selectedTarget, setSelectedTarget] = useState<VerificationTarget>("shipment");
  const [manualCodeType, setManualCodeType] = useState<"qr" | "barcode">(initialCodeType);
  const [manualCode, setManualCode] = useState("");
  const activeStopId = stop?.id;

  const latestResults = useMemo(
    () => scanVerifications.filter((record) => !activeStopId || record.stopId === activeStopId).slice(0, 5),
    [activeStopId, scanVerifications],
  );

  useEffect(() => {
    if (selectedStopId === resolvedStopId) {
      return;
    }

    setSelectedStopId(resolvedStopId);
  }, [resolvedStopId, selectedStopId]);

  useEffect(() => {
    if (!stop) {
      return;
    }

    const hasSelectedTarget = stop.verificationCodes.some((code) => code.target === selectedTarget);
    const nextTarget = hasSelectedTarget ? selectedTarget : (stop.verificationCodes[0]?.target ?? "shipment");

    if (nextTarget !== selectedTarget) {
      setSelectedTarget(nextTarget);
    }
  }, [selectedTarget, stop]);

  const persistCode = useCallback(
    (value: string, codeType: "qr" | "barcode") => {
      if (!stop) {
        return;
      }

      recordScanVerification({
        stopId: stop.id,
        target: selectedTarget,
        scannedValue: value,
        codeType,
      });
      setManualCode(value);
    },
    [recordScanVerification, selectedTarget, stop],
  );

  const { videoRef, isCameraOpen, cameraError, startCamera, stopCamera } = useBarcodeScanner({
    onDetect: (value, codeType) => persistCode(value, codeType),
  });

  if (stops.length === 0) {
    return (
      <section className="space-y-6">
        <BackLink to="/jobs" label="Back to assigned jobs" />
        <section className="panel p-5 text-sm text-stone-600">
          No active assigned jobs currently need shipment, package, or label verification.
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <BackLink to={stop ? `/stops/${stop.id}` : "/jobs"} label={stop ? "Back to job" : "Back to assigned jobs"} />
      <ScreenHeader
        title={manualCodeType === "qr" ? "Scan QR code" : "Scan and verify"}
        subtitle="Use the camera when supported or manual entry when needed."
        kicker="Verification"
      />

      <article className="panel p-5">
        <div className="space-y-4">
          <div>
            <label htmlFor="verify-stop" className="mb-2 block tiny-label">
              Stop
            </label>
            <select
              id="verify-stop"
              className="field-input"
              value={stop?.id ?? ""}
              onChange={(event) => setSelectedStopId(event.target.value)}
            >
              {stops.map((item) => (
                <option key={item.id} value={item.id}>
                  Stop {item.sequence} - {workflowStageLabel[item.workflowStage]} - {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            {(stop?.verificationCodes ?? []).map((code) => {
              const active = selectedTarget === code.target;

              return (
                <button
                  key={code.id}
                  type="button"
                  className={`chip-btn ${active ? "chip-btn-active" : ""}`}
                  onClick={() => {
                    setSelectedTarget(code.target);
                    setManualCodeType(code.codeType);
                  }}
                >
                  {verificationTargetLabel[code.target]}
                </button>
              );
            })}
          </div>

          {stop ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              <p className="tiny-label">Expected code</p>
              <p className="mt-2 font-semibold text-ink">
                {stop.verificationCodes.find((code) => code.target === selectedTarget)?.value ?? "Not configured"}
              </p>
            </div>
          ) : null}
        </div>
      </article>

      <article className="panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="tiny-label">Live scan</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Camera-based decode</h2>
          </div>
          <button type="button" className="secondary-btn px-3 py-2 text-xs" onClick={isCameraOpen ? stopCamera : () => void startCamera()}>
            {isCameraOpen ? "Stop camera" : "Start camera"}
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-stone-300 bg-stone-950">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
        </div>
        {cameraError ? <p className="mt-3 text-sm text-amber-700">{cameraError}</p> : null}
      </article>

      <article className="panel p-5">
        <p className="tiny-label">Manual fallback</p>
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              className={`chip-btn ${manualCodeType === "barcode" ? "chip-btn-active" : ""}`}
              onClick={() => setManualCodeType("barcode")}
            >
              Barcode
            </button>
            <button
              type="button"
              className={`chip-btn ${manualCodeType === "qr" ? "chip-btn-active" : ""}`}
              onClick={() => setManualCodeType("qr")}
            >
              QR
            </button>
          </div>
          <input
            className="field-input"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="Enter or paste scanned value"
          />
          <button type="button" className="primary-btn w-full" onClick={() => persistCode(manualCode, manualCodeType)} disabled={!manualCode.trim()}>
            Verify code
          </button>
        </div>
      </article>

      <div className="space-y-3">
        {latestResults.map((record) => (
          <article key={record.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="tiny-label">
                  {verificationTargetLabel[record.target]} - {record.codeType}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-ink">{record.scannedValue}</h2>
                <p className="mt-2 text-sm text-stone-500">
                  Expected {record.expectedValue ?? "not configured"} - {formatTimestamp(record.createdAt)}
                </p>
              </div>
              <StatusPill label={record.result} tone={scanResultTone[record.result]} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
