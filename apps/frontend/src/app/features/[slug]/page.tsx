import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import CTABanner from "@/components/marketing/CTABanner";
import StructuredData from "@/components/seo/StructuredData";
import { MARKETING_FEATURES } from "@/lib/marketing-data";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

type FeaturePageProps = {
  params: { slug: string };
};

function getFeature(slug: string) {
  return MARKETING_FEATURES.find((feature) => feature.slug === slug);
}

export function generateStaticParams() {
  return MARKETING_FEATURES.map((feature) => ({ slug: feature.slug }));
}

export function generateMetadata({ params }: FeaturePageProps): Metadata {
  const feature = getFeature(params.slug);
  if (!feature) {
    return buildMetadata({
      title: "Feature not found",
      description: "This Fauward feature page is unavailable.",
      path: `/features/${params.slug}`
    });
  }

  return buildMetadata({
    title: `${feature.title} for logistics operations`,
    description: feature.pageDescription,
    path: `/features/${feature.slug}`
  });
}

export default function FeatureDetailPage({ params }: FeaturePageProps) {
  const feature = getFeature(params.slug);

  if (!feature) {
    notFound();
  }

  return (
    <>
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Features", path: "/features" },
          { name: feature.title, path: `/features/${feature.slug}` },
        ])}
      />
      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container">
          <Link href="/features" className="text-sm font-semibold text-brand-navy underline-offset-4 hover:underline">
            ← Back to all features
          </Link>
          <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 md:text-5xl">{feature.title}</h1>
              <p className="mt-6 text-lg text-gray-600">{feature.pageDescription}</p>
              <ul className="mt-8 space-y-3">
                {feature.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3 text-base text-gray-700">
                    <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-amber-600 px-6 text-base font-semibold text-white transition hover:bg-amber-700"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 px-6 text-base font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  View Pricing
                </Link>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <Image src={feature.imageSrc} alt={`${feature.title} screenshot`} width={1020} height={640} className="h-auto w-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16 lg:py-24">
        <div className="marketing-container">
          <h2 className="text-3xl font-semibold text-gray-900">What this gives your team</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {feature.cards.map((card) => (
              <article key={card.title} className="rounded-xl border border-gray-200 bg-white p-8">
                <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
                <p className="mt-3 text-base text-gray-600">{card.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CTABanner />
    </>
  );
}
