import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import type { ShipmentWizardData } from "@/components/shipments/wizard-types";
import { calculateServicePrice } from "@/components/shipments/StepService";

type StepReviewProps = {
  data: ShipmentWizardData;
  onJumpToStep: (step: number) => void;
  onTermsChange: (accepted: boolean) => void;
  errors?: string[];
};

function Section({
  title,
  onEdit,
  children
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <div className="mt-3 text-sm text-gray-700">{children}</div>
    </section>
  );
}

export function StepReview({ data, onJumpToStep, onTermsChange, errors = [] }: StepReviewProps) {
  const pricing = calculateServicePrice(data);

  return (
    <div className="space-y-4">
      <Section title="Addresses" onEdit={() => onJumpToStep(0)}>
        <p>
          <strong>Pickup:</strong> {data.pickup.line1}, {data.pickup.city}, {data.pickup.country}
        </p>
        <p className="mt-1">
          <strong>Delivery:</strong> {data.delivery.line1}, {data.delivery.city}, {data.delivery.country}
        </p>
      </Section>

      <Section title="Package" onEdit={() => onJumpToStep(1)}>
        <p>Weight: {data.packageWeightKg}kg</p>
        <p>Quantity: {data.quantity}</p>
        <p>Description: {data.description || "N/A"}</p>
        <p>Fragile: {data.fragile ? "Yes" : "No"}</p>
      </Section>

      <Section title="Service & pricing" onEdit={() => onJumpToStep(2)}>
        <p>Tier: {data.serviceTier}</p>
        <p>Insurance: {data.insurance ? "Included" : "No"}</p>
        <p>Total: £{pricing.total.toFixed(2)}</p>
      </Section>

      <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={data.termsAccepted}
          onChange={(event) => onTermsChange(event.target.checked)}
        />
        I confirm all shipment details are correct.
      </label>

      {errors.length > 0 ? (
        <ul className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.map((error) => (
            <li key={error}>• {error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
