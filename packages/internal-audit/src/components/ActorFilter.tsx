type ActorFilterProps = {
  actors: Array<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
};

export function ActorFilter({ actors, value, onChange }: ActorFilterProps) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
      Actor
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-[var(--color-border)] bg-white px-2 text-sm font-normal text-[var(--color-text-primary)] dark:bg-neutral-900"
      >
        <option value="">All actors</option>
        {actors.map((actor) => (
          <option key={actor.id} value={actor.id}>{actor.label}</option>
        ))}
      </select>
    </label>
  );
}
