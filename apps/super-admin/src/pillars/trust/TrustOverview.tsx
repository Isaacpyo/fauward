import { PILLARS } from "@/pillars/_manifests";
import { PillarOverviewBase } from "@/pillars/_PillarOverviewBase";

const manifest = PILLARS.find((pillar) => pillar.id === "trust")!;

export function TrustOverview() {
  return <PillarOverviewBase manifest={manifest} />;
}
