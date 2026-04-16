import type { Metadata } from "next";

import AgentSection from "@/components/marketing/AgentSection";
import BusinessSection from "@/components/marketing/BusinessSection";
import CompetitorComparison from "@/components/marketing/CompetitorComparison";
import CTABanner from "@/components/marketing/CTABanner";
import FAQAccordion from "@/components/marketing/FAQAccordion";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import FeatureSection from "@/components/marketing/FeatureSection";
import Hero from "@/components/marketing/Hero";
import HowItWorks from "@/components/marketing/HowItWorks";
import NewsSection from "@/components/marketing/NewsSection";
import PersonaSection from "@/components/marketing/PersonaSection";
import PricingCards from "@/components/marketing/PricingCards";
import RegionStrip from "@/components/marketing/RegionStrip";
import ScreenshotShowcase from "@/components/marketing/ScreenshotShowcase";
import ServicesSection from "@/components/marketing/ServicesSection";
import SocialProof from "@/components/marketing/SocialProof";
import TestimonialCarousel from "@/components/marketing/TestimonialCarousel";
import { GENERAL_FAQ_GROUPS, MARKETING_FEATURES } from "@/lib/marketing-data";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Stop improvising your logistics. Run real software.",
    description:
      "Fauward gives logistics businesses a fully branded platform — shipment ops, invoicing, driver app, and customer tracking — live in 10 minutes. No code. No per-seat fees.",
    path: "/"
  });
}

export default function LandingPage() {
  return (
    <>
      <Hero />

      <FadeInOnScroll>
        <SocialProof />
      </FadeInOnScroll>

      <FadeInOnScroll>
        <PersonaSection />
      </FadeInOnScroll>

      <FadeInOnScroll>
        <HowItWorks />
      </FadeInOnScroll>

      {/* Services overview */}
      <FadeInOnScroll>
        <ServicesSection />
      </FadeInOnScroll>

      <FadeInOnScroll>
        <FeatureSection features={MARKETING_FEATURES} />
      </FadeInOnScroll>

      <FadeInOnScroll>
        <ScreenshotShowcase />
      </FadeInOnScroll>

      {/* AI Agent teaser */}
      <FadeInOnScroll>
        <AgentSection />
      </FadeInOnScroll>

      {/* Business solutions */}
      <FadeInOnScroll>
        <BusinessSection />
      </FadeInOnScroll>

      <FadeInOnScroll>
        <CompetitorComparison />
      </FadeInOnScroll>

      <FadeInOnScroll>
        <section className="bg-gray-50 py-16 lg:py-24">
          <div className="marketing-container">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">
                One flat price. Unlimited seats. No surprises.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-600">
                Pay for the platform, not per person. Bring your whole team for free.
              </p>
            </div>
            <PricingCards condensed showToggle={false} showPricingLink showDifferentiator />
          </div>
        </section>
      </FadeInOnScroll>

      <FadeInOnScroll>
        <RegionStrip />
      </FadeInOnScroll>

      <FadeInOnScroll>
        <TestimonialCarousel />
      </FadeInOnScroll>

      {/* News */}
      <FadeInOnScroll>
        <NewsSection />
      </FadeInOnScroll>

      <FadeInOnScroll>
        <FAQAccordion groups={GENERAL_FAQ_GROUPS} />
      </FadeInOnScroll>

      <FadeInOnScroll>
        <CTABanner />
      </FadeInOnScroll>
    </>
  );
}
