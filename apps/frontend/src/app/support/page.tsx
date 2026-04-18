import type { Metadata } from "next";

import StructuredData from "@/components/seo/StructuredData";
import { GENERAL_FAQ_GROUPS } from "@/lib/marketing-data";
import { buildBreadcrumbSchema, buildFaqSchema, buildMetadata } from "@/lib/seo";

import SupportPageContent from "./SupportPageContent";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Support & Help Centre",
    description: "Browse Fauward support guides, FAQs, onboarding help, and developer resources.",
    path: "/support",
    keywords: ["help centre", "support", "onboarding", "API docs"],
  });
}

export default function SupportPage() {
  return (
    <>
      <StructuredData
        data={[
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Support", path: "/support" },
          ]),
          buildFaqSchema(GENERAL_FAQ_GROUPS),
        ]}
      />
      <SupportPageContent />
    </>
  );
}
