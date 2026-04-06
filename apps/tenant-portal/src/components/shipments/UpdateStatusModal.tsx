import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";

import { FailedDeliveryReasonSelect } from "@/components/shipments/FailedDeliveryReasonSelect";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { getValidNextShipmentStates } from "@/lib/shipment-state";
import type { ShipmentState } from "@/types/domain";

type UpdateStatusPayload = {
  nextStatus: ShipmentState;
  notes?: string;
  timestamp: string;
  failedReason?: string;
  podUploaded?: boolean;
  signatureConfirmed?: boolean;
};

type UpdateStatusModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: ShipmentState;
  onConfirm: (payload: UpdateStatusPayload) => Promise<void>;
};

const statusDescriptions: Record<ShipmentState, string> = {
  PENDING: "Shipment record created and waiting to be processed.",
  PROCESSING: "Shipment is being prepared and validated.",
  PICKED_UP: "Shipment has been collected from origin.",
  IN_TRANSIT: "Shipment is moving between hubs or routes.",
  OUT_FOR_DELIVERY: "Shipment is with driver for final delivery.",
  DELIVERED: "Shipment was delivered to recipient.",
  FAILED_DELIVERY: "Delivery attempt failed and requires next action.",
  RETURNED: "Shipment is being returned to sender.",
  CANCELLED: "Shipment was cancelled before completion.",
  EXCEPTION: "Shipment requires manual intervention due to an exception."
};

const allStates: ShipmentState[] = [
  "PENDING",
  "PROCESSING",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_DELIVERY",
  "RETURNED",
  "CANCELLED",
  "EXCEPTION"
];

export function UpdateStatusModal({
  open,
  onOpenChange,
  currentStatus,
  onConfirm
}: UpdateStatusModalProps) {
  const [selected, setSelected] = useState<ShipmentState | null>(null);
  const [notes, setNotes] = useState("");
  const [timestamp, setTimestamp] = useState(new Date().toISOString().slice(0, 16));
  const [failedReason, setFailedReason] = useState("");
  const [podUploaded, setPodUploaded] = useState(false);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const availableNextStates = useMemo(
    () => getValidNextShipmentStates(currentStatus),
    [currentStatus]
  );

  const canSubmit = Boolean(selected)
    && !(selected === "FAILED_DELIVERY" && !failedReason)
    && !(selected === "DELIVERED" && !(podUploaded || signatureConfirmed));

  const handleConfirm = async () => {
    if (!selected || !canSubmit) {
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm({
        nextStatus: selected,
        notes: notes.trim() || undefined,
        timestamp: new Date(timestamp).toISOString(),
        failedReason: failedReason || undefined,
        podUploaded,
        signatureConfirmed
      });
      onOpenChange(false);
      setSelected(null);
      setNotes("");
      setFailedReason("");
      setPodUploaded(false);
      setSignatureConfirmed(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Update shipment status"
      description="Only valid state transitions are available."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <StatusBadge status={currentStatus} />
          <ArrowRight size={16} className="text-gray-500" />
          <StatusBadge status={selected ?? currentStatus} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {allStates.map((status) => {
            const valid = availableNextStates.includes(status);
            return (
              <button
                key={status}
                type="button"
                disabled={!valid}
                title={!valid ? "Not available from current status" : statusDescriptions[status]}
                onClick={() => setSelected(status)}
                className={`rounded-lg border p-3 text-left transition ${
                  selected === status
                    ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-light)]"
                    : valid
                      ? "border-gray-200 bg-white hover:border-gray-300"
                      : "cursor-not-allowed border-gray-200 bg-gray-100 opacity-65"
                }`}
              >
                <StatusBadge status={status} />
                <p className="mt-2 text-xs text-gray-600">{statusDescriptions[status]}</p>
              </button>
            );
          })}
        </div>

        {selected === "FAILED_DELIVERY" ? (
          <FailedDeliveryReasonSelect value={failedReason} onChange={setFailedReason} />
        ) : null}

        {selected === "DELIVERED" ? (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-800">Delivery confirmation required</p>
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={podUploaded}
                onChange={(event) => setPodUploaded(event.target.checked)}
              />
              POD upload completed
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={signatureConfirmed}
                onChange={(event) => setSignatureConfirmed(event.target.checked)}
              />
              Signature confirmation received
            </label>
          </div>
        ) : null}

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Update note (optional)</label>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add a note about this status update..."
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Timestamp override</label>
          <Input
            type="datetime-local"
            value={timestamp}
            onChange={(event) => setTimestamp(event.target.value)}
          />
        </div>

        <Button onClick={handleConfirm} loading={submitting} disabled={!canSubmit || submitting} className="w-full">
          {selected ? `Update to ${selected}` : "Select a status"}
        </Button>
      </div>
    </Dialog>
  );
}
