import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import type { ShipmentWizardData } from "@/components/shipments/wizard-types";

type StepPackageProps = {
  data: ShipmentWizardData;
  onChange: (data: ShipmentWizardData) => void;
  errors?: string[];
};

export function StepPackage({ data, onChange, errors = [] }: StepPackageProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <Input
          type="number"
          min="0"
          step="0.1"
          placeholder="Weight (kg)"
          value={data.packageWeightKg}
          onChange={(event) => onChange({ ...data, packageWeightKg: event.target.value })}
        />
        <Input
          type="number"
          min="1"
          step="1"
          placeholder="Quantity"
          value={data.quantity}
          onChange={(event) => onChange({ ...data, quantity: event.target.value })}
        />
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="Length (cm)"
          value={data.packageLengthCm}
          onChange={(event) => onChange({ ...data, packageLengthCm: event.target.value })}
        />
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="Width (cm)"
          value={data.packageWidthCm}
          onChange={(event) => onChange({ ...data, packageWidthCm: event.target.value })}
        />
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="Height (cm)"
          value={data.packageHeightCm}
          onChange={(event) => onChange({ ...data, packageHeightCm: event.target.value })}
        />
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <Textarea
          placeholder="Package description"
          value={data.description}
          onChange={(event) => onChange({ ...data, description: event.target.value })}
        />
        <label className="flex min-h-[44px] items-center justify-between">
          <span className="text-sm text-gray-700">Fragile</span>
          <Switch
            checked={data.fragile}
            onCheckedChange={(checked) => onChange({ ...data, fragile: checked })}
          />
        </label>
        <Textarea
          placeholder="Special instructions"
          value={data.specialInstructions}
          onChange={(event) => onChange({ ...data, specialInstructions: event.target.value })}
        />
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
