import type { Metadata } from "next";

import AgentSection from "@/components/marketing/AgentSection";
import BusinessSection from "@/components/marketing/BusinessSection";
import CompetitorComparison from "@/components/marketing/CompetitorComparison";
import CTABanner from "@/components/marketing/CTABanner";
import CustomerTrackingSection from "@/components/marketing/CustomerTrackingSection";
import FAQAccordion from "@/components/marketing/FAQAccordion";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import FauwardGoSection from "@/components/marketing/FauwardGoSection";
import FinanceWorkflowPanel from "@/components/marketing/FinanceWorkflowPanel";
import Hero from "@/components/marketing/Hero";
import NewsSection from "@/components/marketing/NewsSection";
import PlatformModulesGrid from "@/components/marketing/PlatformModulesGrid";
import PricingCards from "@/components/marketing/PricingCards";
import ProblemSection from "@/components/marketing/ProblemSection";
import RegionStrip from "@/components/marketing/RegionStrip";
import ServicesSection from "@/components/marketing/ServicesSection";
import ShipmentLifecycleTimeline from "@/components/marketing/ShipmentLifecycleTimeline";
import SocialProof from "@/components/marketing/SocialProof";
import TestimonialCarousel from "@/components/marketing/TestimonialCarousel";
import StructuredData from "@/components/seo/StructuredData";
import {
  GENERAL_FAQ_GROUPS,
  PRICING_PLANS,
} from "@/lib/marketing-data";
import {
  buildFaqSchema,
  buildMetadata,
  buildSoftwareApplicationSchema,
} from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Logistics command centre for operators who are done with spreadsheets.",
    description:
      "Fauward gives logistics businesses a fully branded command centre — shipment ops, driver app, customer tracking, invoicing, and AI-assisted operations. Live in hours.",
    path: "/",
  });
}

export default function LandingPage() {
  return (
    <>
      <StructuredData
        data={[
          buildFaqSchema(GENERAL_FAQ_GROUPS),
          buildSoftwareApplicationSchema({
            path: "/",
            description:
              "Fauward gives logistics businesses a branded command centre for shipment ops, invoicing, driver workflows, and customer tracking.",
            offers: PRICING_PLANS,
          }),
        ]}
      />

      {/* 1. Hero — dark command centre with mockup */}
      <Hero />

      {/* 2. Social proof strip */}
      <FadeInOnScroll>
        <SocialProof />
      </FadeInOnScroll>

      {/* 3. Problem section — pain cards */}
      <FadeInOnScroll>
        <ProblemSection />
      </FadeInOnScroll>

      {/* 4. Platform modules grid */}
      <FadeInOnScroll>
        <PlatformModulesGrid />
      </FadeInOnScroll>

      {/* 5. Shipment lifecycle timeline */}
      <FadeInOnScroll>
        <ShipmentLifecycleTimeline />
      </FadeInOnScroll>

      {/* 6. Fauward Go — field operations PWA */}
      <FadeInOnScroll>
        <FauwardGoSection />
      </FadeInOnScroll>

      {/* 7. Customer tracking */}
      <FadeInOnScroll>
        <CustomerTrackingSection />
      </FadeInOnScroll>

      {/* 8. Finance & invoicing workflow */}
      <FadeInOnScroll>
        <FinanceWorkflowPanel />
      </FadeInOnScroll>

      {/* 9. Fauward Agent */}
      <FadeInOnScroll>
        <AgentSection />
      </FadeInOnScroll>

      {/* 10. Business solutions */}
      <FadeInOnScroll>
        <BusinessSection />
      </FadeInOnScroll>

      {/* 11. Services overview */}
      <FadeInOnScroll>
        <ServicesSection />
      </FadeInOnScroll>

      {/* 12. Competitor comparison */}
      <FadeInOnScroll>
        <CompetitorComparison />
      </FadeInOnScroll>

      {/* 13. Pricing teaser */}
      <FadeInOnScroll>
        <section className="bg-gray-50 py-16 lg:py-24">
          <div className="marketing-container">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">
                One flat price. Unlimited seats. No surprises.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-600">
                Pay for the platform, not per person. Bring your whole team.
              </p>
            </div>
            <PricingCards condensed showToggle={false} showPricingLink showDifferentiator />
          </div>
        </section>
      </FadeInOnScroll>

      {/* 14. Regions */}
      <FadeInOnScroll>
        <RegionStrip />
      </FadeInOnScroll>

      {/* 15. Testimonials */}
      <FadeInOnScroll>
        <TestimonialCarousel />
      </FadeInOnScroll>

      {/* 16. News */}
      <FadeInOnScroll>
        <NewsSection />
      </FadeInOnScroll>

      {/* 17. FAQ */}
      <FadeInOnScroll>
        <FAQAccordion groups={GENERAL_FAQ_GROUPS} />
      </FadeInOnScroll>

      {/* 18. Final CTA */}
      <FadeInOnScroll>
        <CTABanner />
      </FadeInOnScroll>
    </>
  );
}
