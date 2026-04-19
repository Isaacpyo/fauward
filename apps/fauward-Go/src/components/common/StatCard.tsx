type StatCardProps = {
  label: string;
  value: string;
  helper: string;
};

export const StatCard = ({ label, value, helper }: StatCardProps) => (
  <article className="panel p-4">
    <p className="tiny-label">{label}</p>
    <p className="mt-3 font-display text-3xl text-ink">{value}</p>
    <p className="mt-2 text-sm text-stone-600">{helper}</p>
  </article>
);
