import type { Metadata } from "next";

import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/marketing-data";

const defaultOgImage = "/images/og/marketing-og.svg";

export function absoluteUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, SITE_URL).toString();
}

type MetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function buildMetadata({ title, description, path }: MetadataInput): Metadata {
  const canonical = absoluteUrl(path);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: SITE_NAME,
      images: [{ url: absoluteUrl(defaultOgImage), width: 1200, height: 630, alt: `${SITE_NAME} marketing` }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(defaultOgImage)]
    },
    category: SITE_TAGLINE
  };
}
