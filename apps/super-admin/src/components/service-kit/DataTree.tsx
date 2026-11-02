// Renders an API-provided value (already redacted by the backend) as a nested key/value list, without serialising it.

function Leaf({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-[var(--color-text-muted)]">null</span>;
  if (typeof value === "boolean" || typeof value === "number") return <span className="font-mono text-blue-800">{String(value)}</span>;
  return <span className="break-all font-mono">{String(value)}</span>;
}

export function DataTree({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[var(--color-text-muted)]">empty list</span>;
    return (
      <ol className="space-y-1 pl-3 text-xs">
        {value.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="text-[var(--color-text-muted)]">{index}</span>
            <DataTree value={item} />
          </li>
        ))}
      </ol>
    );
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-[var(--color-text-muted)]">empty</span>;
    return (
      <dl className="space-y-1 text-xs">
        {entries.map(([key, child]) => (
          <div key={key} className="flex gap-2">
            <dt className="shrink-0 font-semibold text-[var(--color-text-muted)]">{key}</dt>
            <dd className="min-w-0">
              <DataTree value={child} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <Leaf value={value} />;
}
