import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { apiRequest } from "@/lib/api";
import { ADVANCE_DRAFT_KEY_PREFIX } from "@/lib/agentLocalKeys";
import { agentPath } from "@/lib/agentPaths";
import { formatAgentStatus, getNextAgentStatus } from "@/lib/agentWorkflow";

type ShipmentEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  at: string;
  location: string | null;
  notes: string | null;
  actorEmail: string | null;
};

type ShipmentRecord = {
  id: string;
  trackingRef: string;
  status: string;
  route: string;
  direction: string;
  destinationAddress: string;
  events: ShipmentEvent[];
};

export function ShipmentPage() {
  const { ref = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [shipment, setShipment] = useState<ShipmentRecord | null>(null);

  useEffect(() => {
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

  const stageStartedAt = useMemo(() => {
    if (!shipment?.events?.length) return null;
    const match = [...shipment.events].reverse().find((event) => event.toStatus === shipment.status);
    return match?.at ? new Date(match.at).getTime() : null;
  }, [shipment]);

  const stageDuration = useMemo(() => {
    if (!stageStartedAt) return "N/A";
    const diffMs = Date.now() - stageStartedAt;
    const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }, [stageStartedAt]);

  function saveDraftAndContinue() {
    if (!ref || !nextStatus) return;
    if (!location.trim() || !notes.trim()) {
      setError("Location and notes are required.");
      return;
    }

    sessionStorage.setItem(
      `${ADVANCE_DRAFT_KEY_PREFIX}${ref}`,
      JSON.stringify({ location: location.trim(), notes: notes.trim() })
    );

    navigate(agentPath(`shipment/${encodeURIComponent(ref)}/confirm`));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
        <Link to={agentPath("dashboard")} className="text-sm text-[var(--tenant-primary)] hover:underline">
          Back to dashboard
        </Link>

        {loading ? <p className="mt-3 text-sm text-gray-600">Loading shipment...</p> : null}
        {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {!loading && shipment ? (
          <>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900">Shipment {shipment.trackingRef}</h1>
            <p className="mt-1 text-sm text-gray-600">Current status: {formatAgentStatus(shipment.status)}</p>

            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Route</p>
                <p className="font-medium text-gray-900">{shipment.route || "N/A"}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Direction</p>
                <p className="font-medium text-gray-900">{shipment.direction || "N/A"}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Time in stage</p>
                <p className="font-medium text-gray-900">{stageDuration}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Destination</p>
                <p className="font-medium text-gray-900">{shipment.destinationAddress || "N/A"}</p>
              </div>
            </div>
          </>
        ) : null}
      </section>

      {!loading && shipment ? (
        <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Next action</h2>
          {nextStatus ? (
            <>
              <p className="mt-1 text-sm text-gray-600">Next status: {formatAgentStatus(nextStatus)}</p>
              <div className="mt-4 grid gap-3">
                <label className="text-sm font-medium text-gray-700">
                  Location
                  <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Lagos Hub" />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Notes
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Short note about this update" />
                </label>
                <Button type="button" onClick={saveDraftAndContinue} className="w-full md:w-auto">
                  Mark {formatAgentStatus(nextStatus)} as completed
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-600">This shipment is in a terminal or unsupported status.</p>
          )}
        </section>
      ) : null}

      {!loading && shipment ? (
        <section className="rounded-xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
          {shipment.events.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No timeline events available.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {shipment.events.map((event) => (
                <li key={event.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      {event.fromStatus ? `${formatAgentStatus(event.fromStatus)} -> ${formatAgentStatus(event.toStatus)}` : formatAgentStatus(event.toStatus)}
                    </span>
                    <span className="text-xs text-gray-500">{new Date(event.at).toLocaleString()}</span>
                  </div>
                  {event.location ? <p className="mt-1 text-gray-700">Location: {event.location}</p> : null}
                  {event.notes ? <p className="mt-1 text-gray-700">Notes: {event.notes}</p> : null}
                  {event.actorEmail ? <p className="mt-1 text-xs text-gray-500">By {event.actorEmail}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
