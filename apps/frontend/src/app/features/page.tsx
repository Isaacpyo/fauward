import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import CTABanner from "@/components/marketing/CTABanner";
import { MARKETING_FEATURES } from "@/lib/marketing-data";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Logistics features built for scale",
    description: "Explore Fauward shipment management, finance, and white-label features.",
    path: "/features"
  });
}

export default function FeaturesOverviewPage() {
  return (
    <>
      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold text-gray-900 md:text-5xl">Features for modern logistics teams</h1>
            <p className="mt-5 text-lg text-gray-600">
              From shipment execution to finance controls, Fauward gives operators and customers one consistent platform.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {MARKETING_FEATURES.map((feature) => (
              <article key={feature.slug} className="rounded-xl border border-gray-200 bg-white">
                <Image src={feature.imageSrc} alt={`${feature.title} preview`} width={520} height={300} className="h-auto w-full rounded-t-xl border-b border-gray-200" />
                <div className="p-8">
                  <h2 className="text-2xl font-semibold text-gray-900">{feature.title}</h2>
                  <p className="mt-3 text-base text-gray-600">{feature.pageDescription}</p>
                  <ul className="mt-5 space-y-2">
                    {feature.bullets.map((bullet) => (
                      <li key={bullet} className="text-sm text-gray-700">
                        • {bullet}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/features/${feature.slug}`}
                    className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    View details
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <CTABanner title="See every feature in action" description="Start a free trial to test workflows, invite your team, and validate your process end-to-end." />
    </>
  );
}
