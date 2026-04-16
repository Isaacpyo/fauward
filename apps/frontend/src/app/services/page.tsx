import type { Metadata } from "next";
import Link from "next/link";
import { Package, Smartphone, FileText, MapPin, Layout, Code } from "lucide-react";
import CTABanner from "@/components/marketing/CTABanner";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import { SERVICES } from "@/lib/marketing-data";
import { buildMetadata } from "@/lib/seo";

const ICON_MAP: Record<string, React.ElementType> = {
  package: Package,
  smartphone: Smartphone,
  "file-text": FileText,
  "map-pin": MapPin,
  layout: Layout,
  code: Code,
};

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Our Services",
    description: "End-to-end logistics services — shipment ops, driver app, invoicing, white-label portals, and API integrations all in one platform.",
    path: "/services",
  });
}

export default function ServicesPage() {
  return (
    <>
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
            From shipment lifecycle management to AI-powered dispatch, Fauward gives operators, drivers, finance teams, and customers one coherent platform.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex h-12 items-center rounded-lg bg-amber-600 px-8 text-base font-semibold text-white transition hover:bg-amber-700">
              Start Free Trial
            </Link>
            <Link href="/pricing" className="inline-flex h-12 items-center rounded-lg border border-white/20 px-8 text-base font-semibold text-white transition hover:bg-white/10">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Services list */}
      <section className="bg-white py-20 lg:py-28">
        <div className="marketing-container">
          <div className="space-y-20">
            {SERVICES.map((service, i) => {
              const Icon = ICON_MAP[service.icon] ?? Package;
              const isEven = i % 2 === 0;
              return (
                <FadeInOnScroll key={service.slug}>
                  <div
                    id={service.slug}
                    className={`grid gap-12 lg:grid-cols-2 lg:items-center ${!isEven ? "lg:direction-rtl" : ""}`}
                  >
                    {/* Text */}
                    <div className={isEven ? "" : "lg:order-2"}>
                      <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                        <Icon size={28} />
                      </div>
                      <h2 className="text-2xl font-bold text-gray-900 lg:text-3xl">{service.title}</h2>
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
                    <div className={`${isEven ? "" : "lg:order-1"}`}>
                      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white">
                            <Icon size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{service.title}</p>
                            <p className="text-xs text-gray-500">Fauward Platform</p>
                          </div>
                          <span className="ml-auto inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Active</span>
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

      <FadeInOnScroll>
        <CTABanner
          title="Ready to run real logistics software?"
          description="Join operators across the UK, Africa, and MENA running their businesses on Fauward."
        />
      </FadeInOnScroll>
    </>
  );
}
