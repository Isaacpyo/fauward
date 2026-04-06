type ActivityEvent = {
  id: string;
  at: string;
  text: string;
  href?: string;
};

type ActivityFeedProps = {
  items: ActivityEvent[];
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <section className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">Recent activity</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded border border-[var(--color-border)] p-2">
            <p className="font-mono text-[11px] text-[var(--color-text-muted)]">{item.at}</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-primary)]">{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

