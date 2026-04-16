import Link from "next/link";
import { NEWS_ARTICLES } from "@/lib/marketing-data";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const CATEGORY_COLORS: Record<string, string> = {
  Product: "bg-blue-50 text-blue-700 border-blue-200",
  Company: "bg-purple-50 text-purple-700 border-purple-200",
  Engineering: "bg-green-50 text-green-700 border-green-200",
  Insights: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function NewsSection() {
  const featured = NEWS_ARTICLES.find((a) => a.featured);
  const rest = NEWS_ARTICLES.filter((a) => !a.featured).slice(0, 4);

  return (
    <section className="bg-gray-50 py-20 lg:py-28">
      <div className="marketing-container">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-600">News & Updates</p>
            <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">Latest from Fauward</h2>
          </div>
          <Link
            href="/news"
            className="shrink-0 text-sm font-semibold text-amber-600 underline-animate transition hover:text-amber-700"
          >
            View all articles →
          </Link>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
          {/* Featured article */}
          {featured && (
            <Link
              href={`/news/${featured.slug}`}
              className="card-lift group flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
            >
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[featured.category] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
                  >
                    {featured.category}
                  </span>
                  <span className="text-xs text-gray-500">{featured.readMinutes} min read</span>
                </div>
                <h3 className="text-xl font-bold leading-snug text-gray-900 group-hover:text-amber-700 transition lg:text-2xl">
                  {featured.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600 line-clamp-3">{featured.summary}</p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <span className="text-xs text-gray-500">{formatDate(featured.publishedAt)}</span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
                  Read article
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
              </div>
            </Link>
          )}

          {/* Recent articles */}
          <div className="flex flex-col gap-4">
            {rest.map((article) => (
              <Link
                key={article.slug}
                href={`/news/${article.slug}`}
                className="card-lift group flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[article.category] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
                  >
                    {article.category}
                  </span>
                  <span className="text-xs text-gray-400">{article.readMinutes} min read</span>
                </div>
                <h3 className="text-sm font-bold leading-snug text-gray-900 group-hover:text-amber-700 transition line-clamp-2">
                  {article.title}
                </h3>
                <span className="text-xs text-gray-400">{formatDate(article.publishedAt)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
