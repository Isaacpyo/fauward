import { Switch } from "@/components/ui/Switch";
import type { ShipmentWizardData } from "@/components/shipments/wizard-types";
import { cn } from "@/lib/utils";

type StepServiceProps = {
  data: ShipmentWizardData;
  onChange: (data: ShipmentWizardData) => void;
  errors?: string[];
};

const serviceOptions: Array<{
  tier: ShipmentWizardData["serviceTier"];
  eta: string;
  price: number;
}> = [
  { tier: "Standard", eta: "2-4 days", price: 12 },
  { tier: "Express", eta: "Next day", price: 26 },
  { tier: "Same Day", eta: "Within 8 hours", price: 42 }
];

export function calculateServicePrice(data: ShipmentWizardData) {
  const base = serviceOptions.find((option) => option.tier === data.serviceTier)?.price ?? 12;
  const insuranceFee = data.insurance ? 4.5 : 0;
  const subtotal = base * Math.max(1, Number(data.quantity || 1));
  const fees = insuranceFee;
  const total = subtotal + fees;
  return { subtotal, fees, total };
}

export function StepService({ data, onChange, errors = [] }: StepServiceProps) {
  const pricing = calculateServicePrice(data);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {serviceOptions.map((option) => (
          <button
            type="button"
            key={option.tier}
            onClick={() => onChange({ ...data, serviceTier: option.tier })}
            className={cn(
              "rounded-lg border bg-white p-4 text-left",
              data.serviceTier === option.tier
                ? "border-[var(--tenant-primary)] ring-2 ring-[var(--tenant-primary-light)]"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <h3 className="text-base font-semibold text-gray-900">{option.tier}</h3>
            <p className="mt-1 text-sm text-gray-600">{option.eta}</p>
            <p className="mt-3 text-lg font-semibold text-gray-900">£{option.price.toFixed(2)}</p>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex min-h-[44px] items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Insurance</p>
            <p className="text-xs text-gray-500">Add shipment insurance for £4.50</p>
          </div>
          <Switch
            checked={data.insurance}
            onCheckedChange={(checked) => onChange({ ...data, insurance: checked })}
          />
        </label>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Pricing summary</h3>
        <dl className="mt-3 space-y-2 text-sm text-gray-700">
          <div className="flex items-center justify-between">
            <dt>Subtotal</dt>
            <dd>£{pricing.subtotal.toFixed(2)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>Fees</dt>
            <dd>£{pricing.fees.toFixed(2)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
            <dt>Total</dt>
            <dd>£{pricing.total.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

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
