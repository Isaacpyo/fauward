import type { Metadata } from "next";

import CTABanner from "@/components/marketing/CTABanner";
import StructuredData from "@/components/seo/StructuredData";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

import ServicesPageContent from "./ServicesPageContent";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Our Services",
    description:
      "End-to-end logistics services — shipment ops, driver app, invoicing, white-label portals, and API integrations all in one platform.",
    path: "/services",
  });
}

export default function ServicesPage() {
  return (
    <>
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Services", path: "/services" },
        ])}
      />

      <ServicesPageContent />

      <CTABanner
        title="Ready to run real logistics software?"
        description="Join operators across the UK & Europe, Africa, and Asia running their businesses on Fauward."
      />
    </>
  );
}
