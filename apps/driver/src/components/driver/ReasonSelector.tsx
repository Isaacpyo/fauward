const reasons = ["Not Home", "Refused", "Wrong Address", "Damaged", "Access Issue", "Other"] as const;

type ReasonSelectorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function ReasonSelector({ value, onChange }: ReasonSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {reasons.map((reason) => (
        <button
          type="button"
          key={reason}
          onClick={() => onChange(reason)}
          className={`min-h-[56px] rounded-xl border px-3 py-2 text-sm font-semibold ${
            value === reason
              ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary)] text-white"
              : "border-[var(--border-color)] bg-white text-gray-700"
          }`}
        >
          {reason}
        </button>
      ))}
    </div>
  );
}

