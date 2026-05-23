import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CTABanner from "@/components/marketing/CTABanner";
import StructuredData from "@/components/seo/StructuredData";
import { MARKETING_FEATURES } from "@/lib/marketing-data";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

import FeatureDetailContent from "./FeatureDetailContent";

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
      path: `/features/${params.slug}`,
    });
  }

  return buildMetadata({
    title: `${feature.title} for logistics operations`,
    description: feature.pageDescription,
    path: `/features/${feature.slug}`,
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

      <FeatureDetailContent feature={feature} />

      <CTABanner />
    </>
  );
}
