import { useState } from "react";

import type { OnboardingState } from "@/components/onboarding/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { TrackingNumber } from "@/components/shared/TrackingNumber";

type StepFirstShipmentProps = {
  state: OnboardingState;
  onChange: (state: OnboardingState) => void;
  onSkip: () => void;
};

export function StepFirstShipment({ state, onChange, onSkip }: StepFirstShipmentProps) {
  const [pickup, setPickup] = useState("12 Marina Way, Lagos");
  const [delivery, setDelivery] = useState("221B Baker Street, London");
  const [description, setDescription] = useState("Sample parcel");
  const [service, setService] = useState("Express");

  const createFirstShipment = async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    const tracking = `FWD-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`;
    onChange({
      ...state,
      firstShipmentCreated: true,
      firstShipmentTracking: tracking
    });
  };

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Create your first shipment</h2>
      <p className="text-sm text-gray-600">Start with sample data and adjust if needed.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={pickup} onChange={(event) => setPickup(event.target.value)} placeholder="Pickup address" />
        <Input value={delivery} onChange={(event) => setDelivery(event.target.value)} placeholder="Delivery address" />
        <Input value={service} onChange={(event) => setService(event.target.value)} placeholder="Service tier" />
      </div>
      <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Package description" />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={createFirstShipment}>Create Shipment</Button>
        <button type="button" className="text-sm text-gray-600 underline" onClick={onSkip}>
          Skip - I'll do this later
        </button>
      </div>

      {state.firstShipmentCreated && state.firstShipmentTracking ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-semibold text-green-800">You just created your first shipment!</p>
          <div className="mt-2">
            <TrackingNumber value={state.firstShipmentTracking} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
