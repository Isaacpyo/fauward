type ActionFilterProps = {
  actions: string[];
  value: string[];
  onChange: (value: string[]) => void;
};

export function ActionFilter({ actions, value, onChange }: ActionFilterProps) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
      Action
      <select
        multiple
        value={value}
        onChange={(event) => onChange(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))}
        className="min-h-9 rounded-md border border-[var(--color-border)] bg-white px-2 text-sm font-normal text-[var(--color-text-primary)] dark:bg-neutral-900"
      >
        {actions.map((action) => (
          <option key={action} value={action}>{action}</option>
        ))}
      </select>
    </label>
  );
}
