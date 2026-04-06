import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import type { AddressFields, ShipmentWizardData } from "@/components/shipments/wizard-types";

type StepAddressesProps = {
  data: ShipmentWizardData;
  onChange: (data: ShipmentWizardData) => void;
  errors?: string[];
};

function AddressForm({
  title,
  value,
  onChange
}: {
  title: string;
  value: AddressFields;
  onChange: (value: AddressFields) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <Input placeholder="Address line 1" value={value.line1} onChange={(event) => onChange({ ...value, line1: event.target.value })} />
      <Input placeholder="Address line 2" value={value.line2} onChange={(event) => onChange({ ...value, line2: event.target.value })} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input placeholder="City" value={value.city} onChange={(event) => onChange({ ...value, city: event.target.value })} />
        <Input placeholder="Postcode" value={value.postcode} onChange={(event) => onChange({ ...value, postcode: event.target.value })} />
        <Input placeholder="Country" value={value.country} onChange={(event) => onChange({ ...value, country: event.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Contact name" value={value.contactName} onChange={(event) => onChange({ ...value, contactName: event.target.value })} />
        <Input placeholder="Contact phone" value={value.contactPhone} onChange={(event) => onChange({ ...value, contactPhone: event.target.value })} />
      </div>
    </div>
  );
}

export function StepAddresses({ data, onChange, errors = [] }: StepAddressesProps) {
  return (
    <div className="space-y-4">
      <AddressForm
        title="Pickup address"
        value={data.pickup}
        onChange={(pickup) => onChange({ ...data, pickup })}
      />

      <AddressForm
        title="Delivery address"
        value={data.delivery}
        onChange={(delivery) => onChange({ ...data, delivery })}
      />

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex min-h-[44px] items-center justify-between gap-4">
          <span className="text-sm text-gray-700">Same as pickup for return address</span>
          <Switch
            checked={data.returnSameAsPickup}
            onCheckedChange={(checked) => onChange({ ...data, returnSameAsPickup: checked })}
          />
        </label>
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
