import type { MetadataRoute } from "next";

import {
  MARKETING_FEATURES,
  NEWS_ARTICLES,
  REGIONS,
} from "@/lib/marketing-data";
import { absoluteUrl } from "@/lib/seo";

const NOW = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/features"),
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/pricing"),
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/services"),
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/business"),
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/agent"),
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/support"),
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/news"),
      lastModified: NOW,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/about"),
      lastModified: NOW,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/legal/privacy"),
      lastModified: NOW,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/legal/terms"),
      lastModified: NOW,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/legal/cookies"),
      lastModified: NOW,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const featureRoutes: MetadataRoute.Sitemap = MARKETING_FEATURES.map((feature) => ({
    url: absoluteUrl(`/features/${feature.slug}`),
    lastModified: NOW,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const regionRoutes: MetadataRoute.Sitemap = REGIONS.map((region) => ({
    url: absoluteUrl(`/regions/${region.slug}`),
    lastModified: NOW,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const newsRoutes: MetadataRoute.Sitemap = NEWS_ARTICLES.map((article) => ({
    url: absoluteUrl(`/news/${article.slug}`),
    lastModified: new Date(article.publishedAt),
    changeFrequency: "monthly",
    priority: article.featured ? 0.7 : 0.6,
  }));

  return [...staticRoutes, ...featureRoutes, ...regionRoutes, ...newsRoutes];
}
