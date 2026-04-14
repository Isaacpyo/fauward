import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type QRScannerProps = {
  onScan: (value: string) => void;
};

export function QRScanner({ onScan }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  async function startCamera() {
    if (!videoRef.current) return;

    setError(null);
    const reader = new BrowserMultiFormatReader();

    try {
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (result) {
          const value = result.getText();
          controlsRef.current?.stop();
          setActive(false);
          onScan(value);
        }
        if (err && err.name !== "NotFoundException") {
          console.error(err);
        }
      });
      setActive(true);
    } catch {
      setError("Camera unavailable. Use manual entry.");
      setActive(false);
    }
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setActive(false);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-[var(--border-color)] bg-black">
        <video ref={videoRef} className="h-72 w-full object-cover" muted playsInline />
      </div>
      <div className="flex gap-2">
        {active ? (
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--border-color)] bg-white px-4 text-sm font-medium text-gray-700"
          >
            Stop camera
          </button>
        ) : (
          <button
            type="button"
            onClick={startCamera}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-[var(--tenant-primary)] px-4 text-sm font-medium text-white"
          >
            Start camera
          </button>
        )}
      </div>
      {error ? <p className="text-xs text-amber-700">{error}</p> : null}
    </div>
  );
}