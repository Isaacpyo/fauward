import { PILLARS } from "@/pillars/_manifests";
import { PillarOverviewBase } from "@/pillars/_PillarOverviewBase";

const manifest = PILLARS.find((pillar) => pillar.id === "gtm")!;

export function GtmOverview() {
  return <PillarOverviewBase manifest={manifest} />;
}
