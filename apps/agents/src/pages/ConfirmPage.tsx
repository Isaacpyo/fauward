import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { apiRequest } from "@/lib/api";
import { enqueueAdvance } from "@/lib/agentOfflineQueue";
import { ADVANCE_DRAFT_KEY_PREFIX } from "@/lib/agentLocalKeys";
import { agentPath } from "@/lib/agentPaths";
import { formatAgentStatus, getNextAgentStatus } from "@/lib/agentWorkflow";

type ShipmentRecord = {
  id: string;
  trackingRef: string;
  status: string;
  route: string;
  direction: string;
};

type AdvancePayload = {
  location: string;
  notes: string;
};

type AdvanceResponse = {
  success: boolean;
  previousStatus: string;
  currentStatus: string;
  nextStatus: string | null;
  timestamp: string;
};

export function ConfirmPage() {
  const { ref = "" } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineQueued, setOfflineQueued] = useState(false);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);
  const [shipment, setShipment] = useState<ShipmentRecord | null>(null);
  const [draft, setDraft] = useState<AdvancePayload | null>(null);

  useEffect(() => {
    const rawDraft = sessionStorage.getItem(`${ADVANCE_DRAFT_KEY_PREFIX}${ref}`);
    if (rawDraft) {
      try {
        setDraft(JSON.parse(rawDraft) as AdvancePayload);
      } catch {
        setDraft(null);
      }
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<{ shipment: ShipmentRecord }>(`/agents/shipments/by-ref/${encodeURIComponent(ref)}`);
        if (!cancelled) {
          setShipment(response.shipment);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : "Unable to load shipment";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [ref]);

  const nextStatus = useMemo(() => (shipment ? getNextAgentStatus(shipment.status) : null), [shipment]);

  async function confirmAdvance() {
    setError(null);
    if (!shipment || !draft || !nextStatus) {
      setError("Missing details to complete this update.");
      return;
    }

    setSubmitting(true);

    try {
      if (!navigator.onLine) {
        enqueueAdvance({ trackingRef: shipment.trackingRef, location: draft.location, notes: draft.notes });
        setOfflineQueued(true);
        sessionStorage.removeItem(`${ADVANCE_DRAFT_KEY_PREFIX}${ref}`);
        return;
      }

      const response = await apiRequest<AdvanceResponse>("/agents/shipments/advance", {
        method: "POST",
        body: JSON.stringify({
          trackingRef: shipment.trackingRef,
          location: draft.location,
          notes: draft.notes
        })
      });

      setSuccessStatus(response.currentStatus);
      sessionStorage.removeItem(`${ADVANCE_DRAFT_KEY_PREFIX}${ref}`);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Failed to update shipment";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">Confirm status update</h1>
      <p className="mt-1 text-sm text-gray-600">Review details before submitting.</p>

      {loading ? <p className="mt-4 text-sm text-gray-600">Loading...</p> : null}
      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {offlineQueued ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Saved offline and queued for sync.
        </p>
      ) : null}

      {!loading && shipment ? (
        <div className="mt-4 space-y-1 text-sm text-gray-700">
          <p>
            Tracking reference: <span className="font-mono font-semibold">{shipment.trackingRef}</span>
          </p>
          <p>Current status: {formatAgentStatus(shipment.status)}</p>
          {nextStatus ? <p>Next status: {formatAgentStatus(nextStatus)}</p> : null}
          {draft?.location ? <p>Location: {draft.location}</p> : null}
          {draft?.notes ? <p>Notes: {draft.notes}</p> : null}
        </div>
      ) : null}

      {successStatus ? (
        <div className="mt-6 space-y-3">
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Shipment updated to {formatAgentStatus(successStatus)}.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to={agentPath(`shipment/${encodeURIComponent(ref)}`)} className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-medium text-gray-700">
              View shipment
            </Link>
            <Link to={agentPath("dashboard")} className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-medium text-gray-700">
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" onClick={confirmAdvance} disabled={submitting || offlineQueued}>
            {submitting ? "Updating..." : "Yes, confirm"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(agentPath(`shipment/${encodeURIComponent(ref)}`))}>
            No, go back
          </Button>
        </div>
      )}
    </div>
  );
}