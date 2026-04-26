import type { Metadata } from "next";

import CareersOpenRolesPage from "@/components/careers/CareersOpenRolesPage";
import StructuredData from "@/components/seo/StructuredData";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Open Roles",
    description: "Explore open roles at Fauward across Engineering, Research, and Design.",
    path: "/careers/open-roles",
  });
}

export default function OpenRolesRoute() {
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
      <CareersOpenRolesPage />
    </>
  );
}
