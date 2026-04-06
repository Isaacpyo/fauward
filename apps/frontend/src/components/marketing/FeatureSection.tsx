import Link from "next/link";
import {
  Package,
  Receipt,
  Palette,
  Map,
  Users,
  BarChart3,
  Truck,
  Globe,
  Zap,
  type LucideIcon
} from "lucide-react";

import type { MarketingFeature } from "@/lib/marketing-data";

const SLUG_ICON_MAP: Record<string, LucideIcon> = {
  "shipment-management": Package,
  "finance": Receipt,
  "white-label": Palette,
  "tracking": Map,
  "team": Users,
  "analytics": BarChart3,
  "driver": Truck,
  "regions": Globe,
  "automation": Zap,
};

type FeatureSectionProps = {
  features: MarketingFeature[];
};

export default function FeatureSection({ features }: FeatureSectionProps) {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">
            Everything your logistics business needs. Nothing it doesn&apos;t.
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Fauward ships with a complete operational stack — so you launch a real business, not a side project.
          </p>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = SLUG_ICON_MAP[feature.slug] ?? Package;

            return (
              <article key={feature.slug} className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 transition-all duration-200 hover:-translate-y-1.5 hover:shadow-lg hover:border-gray-300">
                {/* Amber top border on hover */}
                <span className="absolute inset-x-0 top-0 h-0.5 scale-x-0 bg-amber-600 transition-transform duration-200 group-hover:scale-x-100 origin-left" aria-hidden />

                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-navy/10 transition-colors duration-200 group-hover:bg-amber-50">
                  <Icon className="h-6 w-6 text-brand-navy" aria-hidden />
                </div>
                <h3 className="mt-5 text-xl font-bold text-gray-900">{feature.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-gray-600">{feature.shortDescription}</p>

                <ul className="mt-5 space-y-2.5">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/features/${feature.slug}`}
                  className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-navy underline-offset-4 hover:underline"
                >
                  Learn more
                  <svg
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
