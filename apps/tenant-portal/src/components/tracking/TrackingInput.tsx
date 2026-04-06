import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type TrackingInputProps = {
  value: string;
  loading?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function TrackingInput({
  value,
  loading = false,
  disabled = false,
  onChange,
  onSubmit
}: TrackingInputProps) {
  const canSubmit = value.trim().length > 0 && !loading && !disabled;

  return (
    <div className="space-y-3">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. FWD-2024-XXXXX"
        className="h-12 font-mono text-base"
        disabled={loading || disabled}
      />
      <Button onClick={onSubmit} disabled={!canSubmit} className="w-full sm:w-auto">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Tracking...
          </span>
        ) : (
          "Track"
        )}
      </Button>
    </div>
  );
}
