import { PILLARS } from "@/pillars/_manifests";
import { PillarCard } from "@/shell/PillarCard";
import { TodayStatsStrip } from "@/shell/TodayStatsStrip";

export function PillarDashboard() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Fauward Console</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Internal operations across platform, revenue, customer, trust, and go-to-market teams.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PILLARS.map((pillar) => (
          <PillarCard key={pillar.id} pillar={pillar} />
        ))}
      </section>

      <TodayStatsStrip />
    </div>
  );
}
