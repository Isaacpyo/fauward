import type { Metadata } from "next";

import type { FaqGroup, PricingPlan } from "@/lib/marketing-data";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/marketing-data";

const DEFAULT_OG_IMAGE = "/images/og/marketing-og.svg";
const DEFAULT_DESCRIPTION =
  "Multi-tenant logistics software for shipment operations, invoicing, branded tracking, and white-label customer experiences.";

export const MARKETING_KEYWORDS = [
  "logistics software",
  "courier software",
  "shipment tracking software",
  "white-label logistics platform",
  "delivery management software",
  "multi-tenant logistics SaaS",
  "last-mile delivery software",
  "logistics invoicing platform",
  "driver proof of delivery app",
  "branded tracking portal",
];

export function absoluteUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, SITE_URL).toString();
}

type MetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
  openGraphType?: "website" | "article";
  publishedTime?: string;
};

type SchemaNode = Record<string, unknown>;

export function buildMetadata({
  title,
  description,
  path,
  keywords = [],
  noIndex = false,
  openGraphType = "website",
  publishedTime,
}: MetadataInput): Metadata {
  const canonical = absoluteUrl(path);

  return {
    title,
    description,
    applicationName: SITE_NAME,
    creator: SITE_NAME,
    publisher: SITE_NAME,
    keywords: [...new Set([...MARKETING_KEYWORDS, ...keywords])],
    formatDetection: {
      address: false,
      email: false,
      telephone: false,
    },
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: openGraphType,
      url: canonical,
      siteName: SITE_NAME,
      locale: "en_GB",
      publishedTime,
      images: [
        {
          url: absoluteUrl(DEFAULT_OG_IMAGE),
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} marketing`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(DEFAULT_OG_IMAGE)],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          nocache: true,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    other: {
      "og:locale": "en_GB",
    },
    category: SITE_TAGLINE,
  };
}

export function serializeJsonLd(data: SchemaNode | SchemaNode[]): string {
  const payload = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };

  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

export function buildOrganizationSchema(): SchemaNode {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/brand/logo-mark.png"),
    image: absoluteUrl(DEFAULT_OG_IMAGE),
    description: DEFAULT_DESCRIPTION,
  };
}

export function buildWebsiteSchema(): SchemaNode {
  return {
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    inLanguage: "en-GB",
  };
}

export function buildBreadcrumbSchema(items: Array<{ name: string; path: string }>): SchemaNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function buildFaqSchema(groups: FaqGroup[]): SchemaNode {
  return {
    "@type": "FAQPage",
    mainEntity: groups.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      }))
    ),
  };
}

export function buildSoftwareApplicationSchema({
  path,
  description,
  offers,
}: {
  path: string;
  description: string;
  offers: PricingPlan[];
}): SchemaNode {
  return {
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: absoluteUrl(path),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    image: absoluteUrl(DEFAULT_OG_IMAGE),
    description,
    brand: {
      "@type": "Brand",
      name: SITE_NAME,
    },
    offers: offers.map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      url: absoluteUrl(offer.ctaHref),
      availability: "https://schema.org/InStock",
      priceCurrency: "GBP",
      price: offer.monthlyPrice ?? undefined,
      description: offer.tagline,
      category: offer.name,
    })),
  };
}

export function buildArticleSchema({
  path,
  headline,
  description,
  datePublished,
  articleSection,
  keywords = [],
}: {
  path: string;
  headline: string;
  description: string;
  datePublished: string;
  articleSection: string;
  keywords?: string[];
}): SchemaNode {
  return {
    "@type": "NewsArticle",
    headline,
    description,
    url: absoluteUrl(path),
    mainEntityOfPage: absoluteUrl(path),
    datePublished,
    dateModified: datePublished,
    articleSection,
    image: [absoluteUrl(DEFAULT_OG_IMAGE)],
    keywords,
    author: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/brand/logo-mark.png"),
      },
    },
  };
}
