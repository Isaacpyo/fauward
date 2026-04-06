import { BrowserQRCodeReader } from "@zxing/browser";
import { Flashlight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type QRScannerProps = {
  onDetected: (value: string) => void;
  onClose: () => void;
};

export function QRScanner({ onDetected, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let controls: { stop: () => void } | null = null;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        const text = result?.getText();
        if (!text) return;
        controls?.stop();
        onDetected(text);
      })
      .then((nextControls) => {
        controls = nextControls;
      })
      .catch(() => {
        setError("Camera permission denied or unavailable. Enable camera access or enter tracking manually.");
      });

    return () => {
      controls?.stop();
    };
  }, [onDetected]);

  async function toggleTorch() {
    const stream = videoRef.current?.srcObject;
    if (!(stream instanceof MediaStream)) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const capabilities = track.getCapabilities() as { torch?: boolean };
    if (!capabilities.torch) {
      setError("Torch is not supported on this device.");
      return;
    }

    const next = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
    setTorchOn(next);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4">
      <div className="mx-auto max-w-md rounded-xl border border-[var(--border-color)] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Scan shipment QR</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--border-color)] p-1">
            <X size={16} />
          </button>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-[var(--border-color)] bg-black">
          <video ref={videoRef} className="h-64 w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-36 w-36 rounded-lg border-2 border-white/80" />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={toggleTorch} leftIcon={<Flashlight size={14} />}>
            {torchOn ? "Torch off" : "Torch"}
          </Button>
        </div>

        {error ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{error}</p> : null}

        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-600">Manual fallback</p>
          <div className="flex items-center gap-2">
            <Input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Tracking number or shipment ID" />
            <Button type="button" onClick={() => manualCode && onDetected(manualCode)}>
              Open
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
