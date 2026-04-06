import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CTABanner from "@/components/marketing/CTABanner";
import { REGIONS } from "@/lib/marketing-data";
import { buildMetadata } from "@/lib/seo";

type RegionPageProps = {
  params: { region: string };
};

function getRegion(regionSlug: string) {
  return REGIONS.find((region) => region.slug === regionSlug);
}

export function generateStaticParams() {
  return REGIONS.map((region) => ({ region: region.slug }));
}

export function generateMetadata({ params }: RegionPageProps): Metadata {
  const region = getRegion(params.region);

  if (!region) {
    return buildMetadata({
      title: "Region not found",
      description: "The requested regional page is unavailable.",
      path: `/regions/${params.region}`
    });
  }

  return buildMetadata({
    title: `${region.name} logistics platform`,
    description: region.summary,
    path: `/regions/${region.slug}`
  });
}

export default function RegionPage({ params }: RegionPageProps) {
  const region = getRegion(params.region);

  if (!region) {
    notFound();
  }

  return (
    <>
      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container">
          <p className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-600 inline-flex">
            Regional Coverage
          </p>
          <h1 className="mt-5 text-3xl font-bold text-gray-900 md:text-5xl">{region.name}</h1>
          <p className="mt-6 max-w-3xl text-lg text-gray-600">{region.summary}</p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {region.highlights.map((highlight) => (
              <article key={highlight} className="rounded-xl border border-gray-200 bg-white p-8">
                <h2 className="text-lg font-semibold text-gray-900">{highlight}</h2>
                <p className="mt-3 text-sm text-gray-600">
                  Configure this capability inside your tenant setup during onboarding and expand as your volume grows.
                </p>
              </article>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-amber-600 px-6 text-base font-semibold text-white transition hover:bg-amber-700"
            >
              Start Free Trial
            </Link>
            <Link
              href="/features"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 px-6 text-base font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Explore Features
            </Link>
          </div>
        </div>
      </section>
      <CTABanner title={`Ready to launch in ${region.name}?`} description="Book a walkthrough and map Fauward to your region-specific workflows." ctaLabel="See Demo" ctaHref="/features" />
    </>
  );
}
