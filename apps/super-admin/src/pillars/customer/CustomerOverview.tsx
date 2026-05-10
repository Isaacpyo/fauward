import { PILLARS } from "@/pillars/_manifests";
import { PillarOverviewBase } from "@/pillars/_PillarOverviewBase";

const manifest = PILLARS.find((pillar) => pillar.id === "customer")!;

export function CustomerOverview() {
  return <PillarOverviewBase manifest={manifest} />;
}
