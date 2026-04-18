import type { Metadata } from "next";

import CTABanner from "@/components/marketing/CTABanner";
import FAQAccordion from "@/components/marketing/FAQAccordion";
import FeatureComparisonTable from "@/components/marketing/FeatureComparisonTable";
import PricingCards from "@/components/marketing/PricingCards";
import StructuredData from "@/components/seo/StructuredData";
import {
  BILLING_FAQ_GROUPS,
  PRICING_PLANS,
} from "@/lib/marketing-data";
import {
  buildFaqSchema,
  buildMetadata,
  buildSoftwareApplicationSchema,
} from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Simple, transparent pricing",
    description: "Choose a Fauward plan for your shipment volume, team size, and integration needs.",
    path: "/pricing",
  });
}

export default function PricingPage() {
  return (
    <>
      <StructuredData
        data={[
          buildFaqSchema(BILLING_FAQ_GROUPS),
          buildSoftwareApplicationSchema({
            path: "/pricing",
            description:
              "Compare Fauward pricing for branded logistics operations, finance workflows, and API-enabled delivery automation.",
            offers: PRICING_PLANS,
          }),
        ]}
      />
      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold text-gray-900 md:text-5xl">Simple, transparent pricing</h1>
            <p className="mt-5 text-lg text-gray-600">
              Start with Starter, scale with Pro, and move to Enterprise when your operation needs custom support and controls.
            </p>
          </div>
          <div className="mt-12">
            <PricingCards />
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16 lg:py-24">
        <div className="marketing-container">
          <h2 className="text-3xl font-semibold text-gray-900">Compare plans in detail</h2>
          <p className="mt-3 text-lg text-gray-600">Review plan capabilities for shipment operations, billing, integrations, and support.</p>
          <div className="mt-8">
            <FeatureComparisonTable />
          </div>
        </div>
      </section>

      <FAQAccordion groups={BILLING_FAQ_GROUPS} />
      <CTABanner title="Need a plan tailored to your operation?" description="Talk with our team about enterprise controls, SSO, and dedicated support." ctaLabel="Talk to Sales" ctaHref="/support#contact" />
    </>
  );
}
