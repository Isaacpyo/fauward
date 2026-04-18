import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import StructuredData from "@/components/seo/StructuredData";
import { DOCS_URL, SUPPORT_CATEGORIES } from "@/lib/marketing-data";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

type SupportArticlePageProps = {
  params: { category: string; article: string };
};

function getSupportArticle(categorySlug: string, articleSlug: string) {
  const category = SUPPORT_CATEGORIES.find((entry) => entry.slug === categorySlug);

  if (!category) {
    return null;
  }

  const href = `/support/${categorySlug}/${articleSlug}`;
  const article = category.articles.find((entry) => entry.href === href);

  if (!article) {
    return null;
  }

  return { category, article };
}

function buildChecklist(categorySlug: string, articleTitle: string): string[] {
  switch (categorySlug) {
    case "getting-started":
      return [
        `Confirm the account and tenant details required for "${articleTitle}".`,
        "Apply branding, roles, and onboarding settings before you test the workflow.",
        "Run one live or sample shipment to verify the setup behaves as expected.",
      ];
    case "shipments":
      return [
        `Review the shipment workflow connected to "${articleTitle}".`,
        "Check status transitions, customer notifications, and proof-of-delivery dependencies.",
        "Validate the process with a sample tracking number before rolling it out widely.",
      ];
    case "finance":
      return [
        `Verify the billing configuration needed for "${articleTitle}".`,
        "Confirm payment gateways, reminder rules, and invoice visibility for the right team members.",
        "Export a test report so finance and operations can reconcile the same records.",
      ];
    case "api":
      return [
        `Prepare API keys, webhook endpoints, and sandbox access for "${articleTitle}".`,
        "Test retries and authentication handling before moving traffic into production.",
        "Document the expected payloads and ownership between engineering and operations.",
      ];
    case "drivers":
      return [
        `Set up the mobile workflow required for "${articleTitle}".`,
        "Check device permissions, sync behaviour, and proof capture on a real test device.",
        "Confirm what staff should do when the app is offline or a handoff fails.",
      ];
    case "account":
      return [
        `Review the account controls and ownership model tied to "${articleTitle}".`,
        "Make sure the right administrators can manage billing, access, and audit settings.",
        "Document the process internally so support requests do not rely on one person.",
      ];
    default:
      return [
        `Review the Fauward workflow related to "${articleTitle}".`,
        "Test the setup with a realistic sample before rolling it out.",
        "Escalate unresolved gaps to support so the team can help with the final configuration.",
      ];
  }
}

export function generateStaticParams() {
  return SUPPORT_CATEGORIES.flatMap((category) =>
    category.articles.map((article) => {
      const [, , articleCategory, articleSlug] = article.href.split("/");

      return {
        category: articleCategory,
        article: articleSlug,
      };
    })
  );
}

export function generateMetadata({ params }: SupportArticlePageProps): Metadata {
  const match = getSupportArticle(params.category, params.article);

  if (!match) {
    return buildMetadata({
      title: "Support article not found",
      description: "The requested Fauward support article is unavailable.",
      path: `/support/${params.category}/${params.article}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: `${match.article.title} | Support`,
    description: `${match.category.description} This guide covers ${match.article.title.toLowerCase()}.`,
    path: match.article.href,
    noIndex: true,
  });
}

export default function SupportArticlePage({ params }: SupportArticlePageProps) {
  const match = getSupportArticle(params.category, params.article);

  if (!match) {
    notFound();
  }

  const relatedArticles = match.category.articles.filter((article) => article.href !== match.article.href).slice(0, 3);
  const checklist = buildChecklist(match.category.slug, match.article.title);

  return (
    <>
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Support", path: "/support" },
          { name: match.category.title, path: "/support" },
          { name: match.article.title, path: match.article.href },
        ])}
      />
      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container max-w-4xl">
          <Link href="/support" className="text-sm font-semibold text-brand-navy underline-offset-4 hover:underline">
            Back to support
          </Link>
          <div className="mt-6 rounded-3xl border border-gray-200 bg-gray-50 p-8 lg:p-10">
            <p className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-600">
              {match.category.title}
            </p>
            <h1 className="mt-5 text-3xl font-bold text-gray-900 lg:text-4xl">{match.article.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-gray-700">
              {match.category.description} Use this page as a quick-reference checklist, then open the full documentation for the complete workflow and latest implementation details.
            </p>

            <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Recommended checklist</h2>
              <ul className="mt-4 space-y-3">
                {checklist.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={DOCS_URL}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-6 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                Open full documentation
              </a>
              <Link
                href="/support#contact"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-6 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Contact support
              </Link>
            </div>
          </div>

          {relatedArticles.length ? (
            <div className="mt-10">
              <h2 className="text-xl font-semibold text-gray-900">Related articles</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {relatedArticles.map((article) => (
                  <Link
                    key={article.href}
                    href={article.href}
                    className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-medium text-gray-700 transition hover:border-amber-300 hover:text-amber-700"
                  >
                    {article.title}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
