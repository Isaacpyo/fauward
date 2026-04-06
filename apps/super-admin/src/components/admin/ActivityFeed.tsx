type ActivityEvent = {
  id: string;
  at: string;
  text: string;
  href?: string;
};

type ActivityFeedProps = {
  items: ActivityEvent[];
};

function formatAt(at: string): string {
  try {
    return new Date(at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return at;
  }
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent activity</h3>
      <ul className="mt-3 space-y-0">
        {items.map((item, i) => (
          <li key={item.id} className="relative flex gap-3 group">
            {/* Timeline connector */}
            {i < items.length - 1 && (
              <span className="absolute left-[7px] top-5 bottom-0 w-px bg-gray-200" aria-hidden />
            )}
            <div className="relative mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white">
              <span className="h-2 w-2 rounded-full bg-[var(--fauward-navy)] ring-2 ring-white" />
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <p className="text-xs text-[var(--color-text-primary)] leading-snug group-hover:text-[var(--fauward-navy)] transition">{item.text}</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{formatAt(item.at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
