import { useMemo } from "react";
import { useFieldDataStore } from "@/store/useFieldDataStore";

export const ReturnPickupPage = () => {
  const stops = useFieldDataStore((state) => state.stops);
  const pendingMutations = useFieldDataStore((state) => state.pendingMutations);
  const syncPendingMutations = useFieldDataStore((state) => state.syncPendingMutations);

  const returnStops = useMemo(
    () => stops.filter((stop) => stop.workflowStage === "return_initiation" || stop.workflowStage === "return_receipt"),
    [stops],
  );

  const queueReturnPickup = (stopId: string, shipmentId: string, status: "accepted" | "picked_up" | "received") => {
    const timestamp = new Date().toISOString();
    useFieldDataStore.setState((state) => ({
      pendingMutations: [
        {
          id: crypto.randomUUID(),
          type: "return_pickup",
          entityId: stopId,
          payload: {
            stopId,
            shipmentId,
            status,
          },
          createdAt: timestamp,
          retryCount: 0,
          idempotencyKey: crypto.randomUUID(),
          state: "pending",
        },
        ...state.pendingMutations,
      ],
    }));
    void syncPendingMutations();
  };

  return (
    <main className="screen">
      <section className="stack">
        <header className="screen-header">
          <div>
            <p className="eyebrow">Returns</p>
            <h1>Reverse pickups</h1>
          </div>
          <span className="badge">{pendingMutations.filter((item) => item.type === "return_pickup" && item.state !== "synced").length} queued</span>
        </header>

        <div className="card-list">
          {returnStops.map((stop) => (
            <article className="work-card" key={stop.id}>
              <div className="work-card__body">
                <p className="eyebrow">{stop.workflowStage === "return_receipt" ? "Hub receipt" : "Pickup"}</p>
                <h2>{stop.title}</h2>
                <p>{stop.address}</p>
                <p>{stop.contactName ?? "Customer"} {stop.contactPhone ? `- ${stop.contactPhone}` : ""}</p>
              </div>
              <div className="button-row">
                <button type="button" onClick={() => queueReturnPickup(stop.id, stop.shipmentId, "accepted")}>Accept</button>
                <button type="button" onClick={() => queueReturnPickup(stop.id, stop.shipmentId, "picked_up")}>Picked up</button>
                <button type="button" onClick={() => queueReturnPickup(stop.id, stop.shipmentId, "received")}>Received</button>
              </div>
            </article>
          ))}

          {returnStops.length === 0 ? (
            <section className="empty-state">
              <h2>No reverse pickups assigned</h2>
              <p>Return pickup work will appear here and can be processed offline.</p>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
};
