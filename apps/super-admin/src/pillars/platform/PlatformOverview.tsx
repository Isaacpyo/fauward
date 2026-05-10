import { DashboardOverviewSections } from "@/pages/admin/DashboardPage";
import { PILLARS } from "@/pillars/_manifests";
import { PillarOverviewBase } from "@/pillars/_PillarOverviewBase";

const manifest = PILLARS.find((pillar) => pillar.id === "platform")!;

export function PlatformOverview() {
  return <PillarOverviewBase manifest={manifest} beforeGrid={<DashboardOverviewSections />} />;
}
