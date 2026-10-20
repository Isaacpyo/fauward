import type { Metadata } from "next";

import CareersOpenRolesPage from "@/components/careers/CareersOpenRolesPage";
import StructuredData from "@/components/seo/StructuredData";
import { loadOpenJobs } from "@/lib/careers-jobs";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

export const revalidate = 300;

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Open Roles",
    description: "Explore open roles at Fauward across Engineering, Research, and Design.",
    path: "/careers/open-roles",
  });
}

export default async function OpenRolesRoute() {
  const roles = await loadOpenJobs();

  return (
    <>
      <StructuredData
        data={[
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Careers", path: "/careers" },
            { name: "Open Roles", path: "/careers/open-roles" },
          ]),
        ]}
      />
      <CareersOpenRolesPage roles={roles} />
    </>
  );
}
