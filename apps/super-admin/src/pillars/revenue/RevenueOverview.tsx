import { PILLARS } from "@/pillars/_manifests";
import { PillarOverviewBase } from "@/pillars/_PillarOverviewBase";

const manifest = PILLARS.find((pillar) => pillar.id === "revenue")!;

export function RevenueOverview() {
  return <PillarOverviewBase manifest={manifest} />;
}
