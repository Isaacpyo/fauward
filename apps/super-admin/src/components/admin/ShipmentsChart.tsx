type ShipmentsChartProps = {
  points: Array<{ day: string; value: number }>;
};

export function ShipmentsChart({ points }: ShipmentsChartProps) {
  const max = Math.max(...points.map((point) => point.value), 1);

  return (
    <section className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">Shipments per day (30 days)</h3>
      <div className="mt-3 grid grid-cols-10 gap-1">
        {points.map((point) => (
          <div key={point.day} className="flex flex-col items-center justify-end gap-1">
            <div className="w-full rounded-sm bg-[var(--tenant-primary)]" style={{ height: `${Math.max((point.value / max) * 88, 6)}px` }} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">Last 10 days snapshot</p>
    </section>
  );
}

