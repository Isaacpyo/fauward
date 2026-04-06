import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CameraCapture } from "@/components/driver/CameraCapture";
import { ReasonSelector } from "@/components/driver/ReasonSelector";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDriverStore } from "@/stores/useDriverStore";
import { useOfflineQueue } from "@/stores/useOfflineQueue";

export function FailedDeliveryPage() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { stopId = "" } = useParams();
  const enqueue = useOfflineQueue((state) => state.enqueue);
  const failStop = useDriverStore((state) => state.failStop);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);

  const notesRequired = reason === "Other";
  const canSubmit = reason.length > 0 && (!notesRequired || notes.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (!online) {
      enqueue("failed_delivery", { stopId, reason, notes, photo });
      setSavedOffline(true);
    }
    failStop(stopId);
    setSubmitting(false);
    window.setTimeout(() => navigate("/route"), 1200);
  }

  return (
    <div className="space-y-4 pb-28">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
        <ArrowLeft size={16} />
        Back
      </button>

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <h1 className="text-lg font-semibold text-gray-900">Failed Delivery</h1>
        <p className="mt-1 text-sm text-gray-600">Select reason and submit update.</p>
      </section>

      <ReasonSelector value={reason} onChange={setReason} />
      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Add notes..."
        error={notesRequired && notes.trim().length === 0 ? "Notes required for 'Other'" : undefined}
      />

      <section className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Optional photo</h2>
          <Button variant="secondary" onClick={() => setShowCamera((value) => !value)} className="w-auto min-w-[120px]">
            {showCamera ? "Hide" : "Capture"}
          </Button>
        </div>
        {showCamera ? <div className="mt-3"><CameraCapture image={photo} onCapture={setPhoto} onRetake={() => setPhoto(null)} /></div> : null}
      </section>

      {savedOffline ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />
          Saved offline - will sync when connected.
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-16 border-t border-[var(--border-color)] bg-white px-4 py-3">
        <Button variant="danger" onClick={handleSubmit} disabled={!canSubmit} className="w-full">
          {submitting ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </div>
  );
}

