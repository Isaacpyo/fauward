export function UsageMeter({ used, limit, label }: { used: number; limit: number; label?: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-[var(--color-text-muted)]">{label}</p>}
      <div className="h-2 w-full rounded-full bg-[var(--color-surface-200)]">
        <div className="h-2 rounded-full bg-[var(--color-primary-base)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{used}/{limit}</p>
    </div>
  );
}