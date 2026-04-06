import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CameraCapture } from "@/components/driver/CameraCapture";
import { QRScanner } from "@/components/driver/QRScanner";
import { SignaturePad } from "@/components/driver/SignaturePad";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDriverStore } from "@/stores/useDriverStore";
import { useOfflineQueue } from "@/stores/useOfflineQueue";

export function CapturePODPage() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { stopId = "" } = useParams();
  const stop = useDriverStore((state) => state.stops.find((item) => item.id === stopId));
  const enqueue = useOfflineQueue((state) => state.enqueue);
  const completeStop = useDriverStore((state) => state.completeStop);
  const [image, setImage] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanConfirmed, setScanConfirmed] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!online) {
      enqueue("pod_upload", { stopId, image, signature, notes });
      setOfflineSaved(true);
    }

    completeStop(stopId);
    setSuccess(true);
    setSubmitting(false);
    window.setTimeout(() => navigate("/route"), 1300);
  }

  function onScanDetected(value: string) {
    const code = value.trim().toUpperCase();
    const matched = (stop?.shipments ?? []).some((shipment) => {
      return shipment.id.toUpperCase() === code || shipment.trackingNumber.toUpperCase() === code;
    });

    if (!matched) {
      window.alert("Scanned package does not match this stop.");
      return;
    }

    setScanConfirmed(true);
    setScannerOpen(false);
  }

  if (success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h1 className="mt-3 text-xl font-semibold text-green-800">Delivery confirmed</h1>
        <p className="mt-1 text-sm text-green-700">
          {offlineSaved ? "Saved offline - will sync when connected." : "Uploading proof of delivery."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
        <ArrowLeft size={16} />
        Back
      </button>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <h1 className="text-lg font-semibold text-gray-900">Capture POD</h1>
        <p className="mt-1 text-sm text-gray-600">Take photo, collect signature, then confirm delivery.</p>
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setScannerOpen(true)}>
            Scan package QR
          </Button>
          <span className={`text-xs ${scanConfirmed ? "text-green-700" : "text-gray-500"}`}>
            {scanConfirmed ? "Shipment QR confirmed" : "Scan before confirming POD"}
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <CameraCapture image={image} onCapture={setImage} onRetake={() => setImage(null)} />
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Signature</h2>
        <SignaturePad onChange={setSignature} />
      </section>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Notes (optional)</h2>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add delivery notes..." />
      </section>

      <div className="fixed inset-x-0 bottom-16 border-t border-[var(--border-color)] bg-white px-4 py-3">
        <Button variant="success" onClick={handleConfirm} disabled={!image || !scanConfirmed} className="w-full">
          {submitting ? "Confirming..." : "Confirm Delivery"}
        </Button>
      </div>

      {scannerOpen ? <QRScanner onDetected={onScanDetected} onClose={() => setScannerOpen(false)} /> : null}
    </div>
  );
}
