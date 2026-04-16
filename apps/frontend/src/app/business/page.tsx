import type { Metadata } from "next";
import Link from "next/link";
import { Package, Briefcase, LayoutGrid, Map, CheckCircle2 } from "lucide-react";
import CTABanner from "@/components/marketing/CTABanner";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import PricingCards from "@/components/marketing/PricingCards";
import { BUSINESS_SOLUTIONS } from "@/lib/marketing-data";
import { buildMetadata } from "@/lib/seo";

const ICON_MAP: Record<string, React.ElementType> = {
  "courier-startups": Package,
  "freight-operators": Briefcase,
  "3pl-providers": LayoutGrid,
  "enterprise-fleets": Map,
};

const BG_GRADIENT = [
  "from-amber-50 to-orange-50",
  "from-blue-50 to-indigo-50",
  "from-purple-50 to-violet-50",
  "from-emerald-50 to-teal-50",
];

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Business Solutions",
    description: "Fauward solutions for courier startups, freight operators, 3PL providers, and enterprise fleets.",
    path: "/business",
  });
}

export default function BusinessPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        <div className="pointer-events-none absolute -right-20 top-0 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
        <div className="marketing-container relative text-center">
          <p className="mb-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-400">
            Business Solutions
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-white lg:text-5xl">
            Built for every stage of your logistics operation
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-blue-200">
            Whether you&apos;re launching your first route or managing cross-regional fleets for multiple clients, Fauward has a solution that fits without expensive customisation.
          </p>
        </div>
      </section>

      {/* Solutions */}
      <section className="bg-white py-20 lg:py-28">
        <div className="marketing-container space-y-20">
          {BUSINESS_SOLUTIONS.map((sol, i) => {
            const Icon = ICON_MAP[sol.slug] ?? Package;
            const isEven = i % 2 === 0;
            return (
              <FadeInOnScroll key={sol.slug}>
                <div id={sol.slug} className={`grid gap-12 lg:grid-cols-2 lg:items-center`}>
                  {/* Text side */}
                  <div className={isEven ? "" : "lg:order-2"}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-600">{sol.audience}</p>
                    <h2 className="text-2xl font-bold leading-snug text-gray-900 lg:text-3xl">{sol.title}</h2>
                    <p className="mt-4 text-lg leading-relaxed text-gray-600">{sol.summary}</p>
                    <ul className="mt-6 space-y-3">
                      {sol.outcomes.map((o) => (
                        <li key={o} className="flex items-start gap-3">
                          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-amber-500" />
                          <span className="text-sm text-gray-700">{o}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-8 flex flex-wrap gap-3">
                      <Link
                        href="/signup"
                        className="inline-flex h-11 items-center rounded-lg bg-amber-600 px-6 text-sm font-semibold text-white transition hover:bg-amber-700"
                      >
                        {sol.cta}
                      </Link>
                      <Link
                        href="/pricing"
                        className="inline-flex h-11 items-center rounded-lg border border-gray-300 px-6 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        View Pricing
                      </Link>
                    </div>
                  </div>

                  {/* Visual side */}
                  <div className={isEven ? "" : "lg:order-1"}>
                    <div className={`overflow-hidden rounded-2xl bg-gradient-to-br p-8 ${BG_GRADIENT[i % BG_GRADIENT.length]} border border-gray-200 shadow-sm`}>
                      <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm text-gray-700">
                        <Icon size={26} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{sol.audience}</h3>
                      <p className="mt-2 text-sm text-gray-600">{sol.summary}</p>
                      <div className="mt-6 space-y-2">
                        {sol.outcomes.map((o) => (
                          <div key={o} className="flex items-center gap-2 rounded-lg bg-white/70 px-4 py-2.5">
                            <CheckCircle2 size={14} className="shrink-0 text-amber-600" />
                            <span className="text-xs font-medium text-gray-800">{o}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </FadeInOnScroll>
            );
          })}
        </div>
      </section>

      {/* Pricing preview */}
      <FadeInOnScroll>
        <section className="bg-gray-50 py-20 lg:py-24">
          <div className="marketing-container">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-bold text-gray-900">One flat price for every team size</h2>
              <p className="mt-3 text-lg text-gray-600">No per-seat fees. Add as many dispatchers as you need.</p>
            </div>
            <PricingCards condensed showToggle={false} showPricingLink showDifferentiator />
          </div>
        </section>
      </FadeInOnScroll>

      <FadeInOnScroll>
        <CTABanner
          title="Not sure which plan fits your operation?"
          description="Talk with our team. We&apos;ll help you find the right fit — no hard sell."
          ctaLabel="Talk to Sales"
          ctaHref="/support#contact"
        />
      </FadeInOnScroll>
    </>
  );
}
