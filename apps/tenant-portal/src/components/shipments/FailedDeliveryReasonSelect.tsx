import { Select } from "@/components/ui/Select";

export const failedDeliveryReasonOptions = [
  { label: "Recipient not home", value: "not_home" },
  { label: "Recipient refused delivery", value: "refused" },
  { label: "Wrong address", value: "wrong_address" },
  { label: "Package damaged", value: "damaged" },
  { label: "Other", value: "other" }
];

type FailedDeliveryReasonSelectProps = {
  value: string;
  onChange: (value: string) => void;
};

export function FailedDeliveryReasonSelect({ value, onChange }: FailedDeliveryReasonSelectProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Failed delivery reason</label>
      <Select
        value={value}
        onValueChange={onChange}
        options={failedDeliveryReasonOptions}
        placeholder="Select a reason"
      />
    </div>
  );
}
