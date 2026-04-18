import type { Metadata } from "next";
import Link from "next/link";
import { Package, Smartphone, FileText, MapPin, Layout, Code, Briefcase, LayoutGrid, Map, CheckCircle2 } from "lucide-react";
import CTABanner from "@/components/marketing/CTABanner";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import PricingCards from "@/components/marketing/PricingCards";
import StructuredData from "@/components/seo/StructuredData";
import { SERVICES, BUSINESS_SOLUTIONS } from "@/lib/marketing-data";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

const SERVICE_ICON_MAP: Record<string, React.ElementType> = {
  package: Package,
  smartphone: Smartphone,
  "file-text": FileText,
  "map-pin": MapPin,
  layout: Layout,
  code: Code,
};

const AUDIENCE_ICON_MAP: Record<string, React.ElementType> = {
  "courier-startups": Package,
  "freight-operators": Briefcase,
  "3pl-providers": LayoutGrid,
  "enterprise-fleets": Map,
};

const AUDIENCE_GRADIENT = [
  "from-amber-50 to-orange-50 border-amber-100",
  "from-blue-50 to-indigo-50 border-blue-100",
  "from-purple-50 to-violet-50 border-purple-100",
  "from-emerald-50 to-teal-50 border-emerald-100",
];

const AUDIENCE_CTA_HREF: Record<string, string> = {
  "courier-startups": "/signup",
  "freight-operators": "/signup",
  "3pl-providers": "/support#contact",
  "enterprise-fleets": "/support#contact",
};

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

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 -translate-y-1/4 translate-x-1/4 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
        <div className="marketing-container relative text-center">
          <p className="mb-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-400">
            Services
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-white lg:text-5xl">
            Everything your logistics business needs, under one roof
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-blue-200">
            From shipment lifecycle management to AI-powered dispatch, Fauward gives operators,
            drivers, finance teams, and customers one coherent platform.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center rounded-lg bg-amber-600 px-8 text-base font-semibold text-white transition hover:bg-amber-700"
            >
              Start Free Trial
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center rounded-lg border border-white/20 px-8 text-base font-semibold text-white transition hover:bg-white/10"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ── Platform capabilities ────────────────────────────────────── */}
      <section className="bg-white py-20 lg:py-28">
        <div className="marketing-container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">Platform capabilities</h2>
            <p className="mt-4 text-lg text-gray-600">
              Every module is built for the realities of running freight and courier operations — not adapted from a generic SaaS.
            </p>
          </div>

          <div className="space-y-20 mt-16">
            {SERVICES.map((service, i) => {
              const Icon = SERVICE_ICON_MAP[service.icon] ?? Package;
              const isEven = i % 2 === 0;
              return (
                <FadeInOnScroll key={service.slug}>
                  <div id={service.slug} className="grid gap-12 lg:grid-cols-2 lg:items-center">
                    {/* Text */}
                    <div className={isEven ? "" : "lg:order-2"}>
                      <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                        <Icon size={28} />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 lg:text-3xl">{service.title}</h3>
                      <p className="mt-4 text-lg leading-relaxed text-gray-600">{service.summary}</p>
                      <ul className="mt-6 space-y-3">
                        {service.bullets.map((b) => (
                          <li key={b} className="flex items-start gap-3 text-sm text-gray-700">
                            <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" />
                            </svg>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Visual card */}
                    <div className={isEven ? "" : "lg:order-1"}>
                      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-8 shadow-sm">
                        <div className="mb-6 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white">
                            <Icon size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{service.title}</p>
                            <p className="text-xs text-gray-500">Fauward Platform</p>
                          </div>
                          <span className="ml-auto inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                            Active
                          </span>
                        </div>
                        <div className="space-y-2">
                          {[
                            { label: "Status", value: "Operational" },
                            { label: "Uptime", value: "99.9%" },
                            { label: "Region", value: "UK · Africa · MENA" },
                          ].map((row) => (
                            <div key={row.label} className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5">
                              <span className="text-xs text-gray-500">{row.label}</span>
                              <span className="text-xs font-semibold text-gray-900">{row.value}</span>
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
        </div>
      </section>

      {/* ── Audience fit (merged from /business) ─────────────────────── */}
      <section className="bg-gray-50 py-20 lg:py-28">
        <div className="marketing-container">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-600">Who it's built for</p>
            <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">
              Built for every stage of your logistics operation
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Whether you&apos;re a two-van courier startup or managing a cross-regional fleet for multiple clients,
              Fauward scales with you — without re-platforming.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {BUSINESS_SOLUTIONS.map((sol, i) => {
              const Icon = AUDIENCE_ICON_MAP[sol.slug] ?? Package;
              const gradient = AUDIENCE_GRADIENT[i % AUDIENCE_GRADIENT.length];
              const ctaHref = AUDIENCE_CTA_HREF[sol.slug] ?? "/signup";
              return (
                <FadeInOnScroll key={sol.slug}>
                  <div
                    id={sol.slug}
                    className={`card-lift group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-8 ${gradient}`}
                  >
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm text-gray-700">
                      <Icon size={22} />
                    </div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">{sol.audience}</p>
                    <h3 className="mb-3 text-xl font-bold leading-snug text-gray-900">{sol.title}</h3>
                    <p className="mb-5 text-sm leading-relaxed text-gray-700">{sol.summary}</p>
                    <ul className="mb-6 space-y-2">
                      {sol.outcomes.map((o) => (
                        <li key={o} className="flex items-start gap-2 text-sm text-gray-800">
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-amber-600" />
                          {o}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={ctaHref}
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 group-hover:shadow-md"
                    >
                      {sol.cta}
                      <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </Link>
                  </div>
                </FadeInOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Pricing strip ───────────────────────────────────────────── */}
      <FadeInOnScroll>
        <section className="bg-white py-20 lg:py-24">
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
          title="Ready to run real logistics software?"
          description="Join operators across the UK, Africa, and MENA running their businesses on Fauward."
        />
      </FadeInOnScroll>
    </>
  );
}
