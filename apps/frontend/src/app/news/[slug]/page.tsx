import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CTABanner from "@/components/marketing/CTABanner";
import StructuredData from "@/components/seo/StructuredData";
import { NEWS_ARTICLES } from "@/lib/marketing-data";
import { NEWS_ARTICLE_DETAILS } from "@/lib/news-content";
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildMetadata,
} from "@/lib/seo";

type NewsArticlePageProps = {
  params: { slug: string };
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function getArticle(slug: string) {
  const article = NEWS_ARTICLES.find((entry) => entry.slug === slug);
  const detail = NEWS_ARTICLE_DETAILS[slug];

  if (!article || !detail) {
    return null;
  }

  return { ...article, ...detail };
}

export function generateStaticParams() {
  return NEWS_ARTICLES.filter((article) => NEWS_ARTICLE_DETAILS[article.slug]).map((article) => ({
    slug: article.slug,
  }));
}

export function generateMetadata({ params }: NewsArticlePageProps): Metadata {
  const article = getArticle(params.slug);

  if (!article) {
    return buildMetadata({
      title: "Article not found",
      description: "The requested Fauward article is unavailable.",
      path: `/news/${params.slug}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: article.title,
    description: article.summary,
    path: `/news/${article.slug}`,
    keywords: ["news", article.category, "logistics", "operations", "product updates"],
    openGraphType: "article",
    publishedTime: article.publishedAt,
  });
}

export default function NewsArticlePage({ params }: NewsArticlePageProps) {
  const article = getArticle(params.slug);

  if (!article) {
    notFound();
  }

  return (
    <>
      <StructuredData
        data={[
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "News", path: "/news" },
            { name: article.title, path: `/news/${article.slug}` },
          ]),
          buildArticleSchema({
            path: `/news/${article.slug}`,
            headline: article.title,
            description: article.summary,
            datePublished: article.publishedAt,
            articleSection: article.category,
            keywords: ["logistics software", "courier software", article.category],
          }),
        ]}
      />
      <article className="bg-white py-16 lg:py-24">
        <div className="marketing-container max-w-4xl">
          <Link href="/news" className="text-sm font-semibold text-brand-navy underline-offset-4 hover:underline">
            Back to news
          </Link>
          <div className="mt-6">
            <p className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
              {article.category}
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight text-gray-900 lg:text-5xl">
              {article.title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <span>{formatDate(article.publishedAt)}</span>
              <span>{article.readMinutes} min read</span>
            </div>
            <p className="mt-8 text-lg leading-relaxed text-gray-700">{article.lead}</p>
          </div>

          <div className="mt-12 space-y-10">
            {article.sections.map((section) => (
              <section key={section.heading} className="rounded-2xl border border-gray-200 bg-gray-50 p-8">
                <h2 className="text-2xl font-semibold text-gray-900">{section.heading}</h2>
                <div className="mt-4 space-y-4 text-base leading-relaxed text-gray-700">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.bullets ? (
                  <ul className="mt-6 space-y-3">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 text-sm text-gray-700">
                        <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" aria-hidden />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </article>
      <CTABanner
        title="See how Fauward fits your operation"
        description="Book a walkthrough to map these product updates to your shipment, finance, and customer workflows."
        ctaLabel="Start Free Trial"
        ctaHref="/signup"
      />
    </>
  );
}
