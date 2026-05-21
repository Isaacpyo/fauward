import type { Metadata } from "next";

import CTABanner from "@/components/marketing/CTABanner";
import StructuredData from "@/components/seo/StructuredData";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

import AboutPageContent from "./AboutPageContent";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "About Us",
    description:
      "The story behind Fauward — who we are, what we believe, and why we're building the logistics platform operators deserve.",
    path: "/about",
  });
}

export default function AboutPage() {
  return (
    <>
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ])}
      />

      <AboutPageContent />

      <CTABanner
        title="Want to join the team?"
        description="We&apos;re a remote-first company building for operators worldwide. If the problem excites you, reach out."
        ctaLabel="See Open Roles"
        ctaHref="/support#contact"
      />
    </>
  );
}
