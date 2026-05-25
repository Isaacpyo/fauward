import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { FailedDeliveryReasonSelect } from "@/components/shipments/FailedDeliveryReasonSelect";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { getValidNextShipmentStates } from "@/lib/shipment-state";
import type { ShipmentState } from "@/types/domain";

type UpdateStatusPayload = {
  nextStatus: ShipmentState;
  notes?: string;
  timestamp: string;
  failedReason?: string;
  podUploaded?: boolean;
  signatureConfirmed?: boolean;
  assignedDriverId?: string;
  courierRefOrigin?: string;
  courierRefDestination?: string;
  originCourierConfirmed?: boolean;
  destinationCourierConfirmed?: boolean;
  customsClearanceConfirmed?: boolean;
};

type FleetDriver = {
  id: string;
  user: { id: string; firstName: string; lastName: string; email: string };
};

type UpdateStatusModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: ShipmentState;
  onConfirm: (payload: UpdateStatusPayload) => Promise<void>;
  hasAssignedDriver?: boolean;
};

const statusDescriptions: Record<ShipmentState, string> = {
  PENDING: "Shipment record created and waiting to be processed.",
  PROCESSING: "Shipment is being prepared and validated.",
  PICKED_UP: "Shipment has been collected from origin.",
  IN_TRANSIT: "Shipment is moving between hubs or routes.",
  OUT_FOR_DELIVERY: "Shipment is with the field operator for final delivery.",
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

const FO_MANAGED_STATES: ShipmentState[] = ["PICKED_UP", "DELIVERED"];

export function UpdateStatusModal({
  open,
  onOpenChange,
  currentStatus,
  onConfirm,
  hasAssignedDriver: _hasAssignedDriver = false
}: UpdateStatusModalProps) {
  const [selected, setSelected] = useState<ShipmentState | null>(null);
  const [notes, setNotes] = useState("");
  const [timestamp, setTimestamp] = useState(new Date().toISOString().slice(0, 16));
  const [failedReason, setFailedReason] = useState("");
  const [podUploaded, setPodUploaded] = useState(false);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assignedDriverId, setAssignedDriverId] = useState("");
  const [courierRefOrigin, setCourierRefOrigin] = useState("");
  const [courierRefDestination, setCourierRefDestination] = useState("");
  const [originCourierConfirmed, setOriginCourierConfirmed] = useState(false);
  const [destinationCourierConfirmed, setDestinationCourierConfirmed] = useState(false);
  const [customsClearanceConfirmed, setCustomsClearanceConfirmed] = useState(false);

  const driversQuery = useQuery({
    queryKey: ["fleet-drivers-for-assignment"],
    queryFn: async () => {
      const res = await api.get<{ drivers: FleetDriver[] }>("/v1/fleet/drivers");
      return res.data.drivers;
    },
    enabled: selected === "PROCESSING"
  });

  const availableNextStates = useMemo(
    () => getValidNextShipmentStates(currentStatus),
    [currentStatus]
  );

  const canSubmit = Boolean(selected)
    && !(selected === "FAILED_DELIVERY" && !failedReason)
    && !(selected === "DELIVERED" && !(podUploaded || signatureConfirmed))
    && !(selected === "PROCESSING" && !assignedDriverId)
    && !(selected === "IN_TRANSIT" && (
      !originCourierConfirmed
      || !destinationCourierConfirmed
      || !customsClearanceConfirmed
      || !courierRefOrigin.trim()
      || !courierRefDestination.trim()
    ));

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
        signatureConfirmed,
        assignedDriverId: assignedDriverId || undefined,
        courierRefOrigin: courierRefOrigin.trim() || undefined,
        courierRefDestination: courierRefDestination.trim() || undefined,
        originCourierConfirmed,
        destinationCourierConfirmed,
        customsClearanceConfirmed
      });
      onOpenChange(false);
      setSelected(null);
      setNotes("");
      setFailedReason("");
      setPodUploaded(false);
      setSignatureConfirmed(false);
      setAssignedDriverId("");
      setCourierRefOrigin("");
      setCourierRefDestination("");
      setOriginCourierConfirmed(false);
      setDestinationCourierConfirmed(false);
      setCustomsClearanceConfirmed(false);
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

        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>Picked Up</strong> and <strong>Delivered</strong> are set automatically when the field operator completes their task in Fauward Go.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {allStates.map((status) => {
            const valid = availableNextStates.includes(status);
            const foManaged = FO_MANAGED_STATES.includes(status);
            const disabled = !valid || foManaged;
            const title = foManaged
              ? "Managed by field operator — will update automatically"
              : !valid
                ? "Not available from current status"
                : statusDescriptions[status];
            return (
              <button
                key={status}
                type="button"
                disabled={disabled}
                title={title}
                onClick={() => setSelected(status)}
                className={`rounded-lg border p-3 text-left transition ${
                  selected === status
                    ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-light)]"
                    : foManaged
                      ? "cursor-not-allowed border-amber-200 bg-amber-50 opacity-60"
                      : valid
                        ? "border-gray-200 bg-white hover:border-gray-300"
                        : "cursor-not-allowed border-gray-200 bg-gray-100 opacity-65"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <StatusBadge status={status} />
                  {foManaged && (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                      FO only
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-600">{statusDescriptions[status]}</p>
              </button>
            );
          })}
        </div>

        {selected === "PROCESSING" ? (
          <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm font-medium text-blue-900">Assign a field operator <span className="text-blue-600">*</span></p>
            <p className="text-xs text-blue-700">The selected FO will receive this job in Fauward Go.</p>
            {driversQuery.isLoading ? (
              <p className="text-xs text-blue-600">Loading field operators…</p>
            ) : driversQuery.isError ? (
              <p className="text-xs text-red-600">Failed to load field operators. Please try again.</p>
            ) : (
              <select
                value={assignedDriverId}
                onChange={(e) => setAssignedDriverId(e.target.value)}
                className="w-full rounded-md border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select a field operator…</option>
                {driversQuery.data?.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.user.firstName} {driver.user.lastName}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

        {selected === "IN_TRANSIT" ? (
          <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <p className="text-sm font-medium text-indigo-900">In-transit confirmation required <span className="text-indigo-600">*</span></p>

            <label className="flex min-h-[44px] items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={originCourierConfirmed}
                onChange={(e) => setOriginCourierConfirmed(e.target.checked)}
              />
              <span>Courier at <strong>origin</strong> has confirmed pickup</span>
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Origin courier reference number <span className="text-indigo-600">*</span></label>
              <Input
                value={courierRefOrigin}
                onChange={(e) => setCourierRefOrigin(e.target.value)}
                placeholder="e.g. FEDEX-123456"
              />
            </div>

            <label className="flex min-h-[44px] items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={destinationCourierConfirmed}
                onChange={(e) => setDestinationCourierConfirmed(e.target.checked)}
              />
              <span>Courier at <strong>destination</strong> has confirmed readiness</span>
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Destination courier reference number <span className="text-indigo-600">*</span></label>
              <Input
                value={courierRefDestination}
                onChange={(e) => setCourierRefDestination(e.target.value)}
                placeholder="e.g. DHL-789012"
              />
            </div>

            <label className="flex min-h-[44px] items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={customsClearanceConfirmed}
                onChange={(e) => setCustomsClearanceConfirmed(e.target.checked)}
              />
              <span>Customs clearance confirmed (or not required)</span>
            </label>
          </div>
        ) : null}

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
