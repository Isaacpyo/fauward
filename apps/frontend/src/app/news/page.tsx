import type { Metadata } from "next";
import Link from "next/link";
import CTABanner from "@/components/marketing/CTABanner";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import { NEWS_ARTICLES } from "@/lib/marketing-data";
import { buildMetadata } from "@/lib/seo";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const CATEGORY_COLORS: Record<string, string> = {
  Product: "bg-blue-50 text-blue-700 border-blue-200",
  Company: "bg-purple-50 text-purple-700 border-purple-200",
  Engineering: "bg-green-50 text-green-700 border-green-200",
  Insights: "bg-amber-50 text-amber-700 border-amber-200",
};

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "News & Updates",
    description: "Product announcements, engineering deep-dives, and logistics industry insights from the Fauward team.",
    path: "/news",
  });
}

export default function NewsPage() {
  const featured = NEWS_ARTICLES.find((a) => a.featured);
  const rest = NEWS_ARTICLES.filter((a) => !a.featured);
  const categories = Array.from(new Set(NEWS_ARTICLES.map((a) => a.category)));

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0d1f3c] py-16 lg:py-20">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        <div className="marketing-container relative text-center">
          <p className="mb-3 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-400">
            News & Updates
          </p>
          <h1 className="mx-auto max-w-2xl text-4xl font-bold text-white lg:text-5xl">Latest from Fauward</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-blue-200">
            Product launches, engineering stories, and insights on the logistics industry.
          </p>
        </div>
      </section>

      <section className="bg-white py-16 lg:py-20">
        <div className="marketing-container">
          {/* Category filter strip */}
          <div className="mb-10 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white">All</span>
            {categories.map((cat) => (
              <span
                key={cat}
                className={`inline-flex cursor-pointer rounded-full border px-4 py-1.5 text-xs font-semibold transition hover:bg-gray-100 ${CATEGORY_COLORS[cat] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}
              >
                {cat}
              </span>
            ))}
          </div>

          {/* Featured */}
          {featured && (
            <FadeInOnScroll>
              <Link
                href={`/news/${featured.slug}`}
                className="card-lift group mb-10 grid overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[1fr,380px]"
              >
                {/* Placeholder image area */}
                <div className="flex min-h-[220px] items-center justify-center bg-gradient-to-br from-[#0d1f3c] to-[#1a3a6e] p-10">
                  <div className="text-center">
                    <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20">
                      <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.091z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-white">Featured Article</p>
                  </div>
                </div>
                <div className="flex flex-col justify-between p-8">
                  <div>
                    <div className="mb-3 flex items-center gap-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[featured.category] ?? ""}`}>
                        {featured.category}
                      </span>
                      <span className="text-xs text-gray-500">{featured.readMinutes} min read</span>
                    </div>
                    <h2 className="text-xl font-bold leading-snug text-gray-900 group-hover:text-amber-700 transition lg:text-2xl">
                      {featured.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-gray-600 line-clamp-3">{featured.summary}</p>
                  </div>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-xs text-gray-500">{formatDate(featured.publishedAt)}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
                      Read →
                    </span>
                  </div>
                </div>
              </Link>
            </FadeInOnScroll>
          )}

          {/* Article grid */}
          <FadeInOnScroll>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((article) => (
                <Link
                  key={article.slug}
                  href={`/news/${article.slug}`}
                  className="card-lift group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                  {/* Color accent bar */}
                  <div className={`mb-5 h-1 w-12 rounded-full ${article.category === "Product" ? "bg-blue-500" : article.category === "Engineering" ? "bg-green-500" : article.category === "Company" ? "bg-purple-500" : "bg-amber-500"}`} />
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[article.category] ?? ""}`}>
                      {article.category}
                    </span>
                    <span className="text-xs text-gray-400">{article.readMinutes} min read</span>
                  </div>
                  <h3 className="flex-1 text-base font-bold leading-snug text-gray-900 group-hover:text-amber-700 transition">
                    {article.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 line-clamp-2">{article.summary}</p>
                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{formatDate(article.publishedAt)}</span>
                    <span className="text-xs font-semibold text-amber-600 group-hover:underline">Read →</span>
                  </div>
                </Link>
              ))}
            </div>
          </FadeInOnScroll>
        </div>
      </section>

      <FadeInOnScroll>
        <CTABanner
          title="Never miss a product update"
          description="Subscribe to the Fauward newsletter for product releases, industry insights, and ops tips."
          ctaLabel="Subscribe"
          ctaHref="/signup"
        />
      </FadeInOnScroll>
    </>
  );
}
