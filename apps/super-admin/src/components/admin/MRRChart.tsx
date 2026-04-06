type MRRPoint = { month: string; value: number };

type MRRChartProps = {
  points: MRRPoint[];
};

export function MRRChart({ points }: MRRChartProps) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const polyline = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - (point.value / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <section className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">MRR growth (12 months)</h3>
      <svg viewBox="0 0 100 100" className="mt-2 h-36 w-full">
        <polyline fill="none" stroke="var(--fauward-amber)" strokeWidth="2" points={polyline} />
      </svg>
      <div className="mt-1 grid grid-cols-6 gap-1 text-[10px] text-[var(--color-text-muted)]">
        {points.slice(-6).map((point) => (
          <span key={point.month}>{point.month}</span>
        ))}
      </div>
    </section>
  );
}

