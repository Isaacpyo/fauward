import Link from "next/link";
import { BUSINESS_SOLUTIONS } from "@/lib/marketing-data";
import { Package, Briefcase, LayoutGrid, Map } from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  "courier-startups": Package,
  "freight-operators": Briefcase,
  "3pl-providers": LayoutGrid,
  "enterprise-fleets": Map,
};

const ACCENT_COLORS = [
  "from-amber-50 to-orange-50 border-amber-100",
  "from-blue-50 to-indigo-50 border-blue-100",
  "from-purple-50 to-violet-50 border-purple-100",
  "from-emerald-50 to-teal-50 border-emerald-100",
];

export default function BusinessSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="marketing-container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-600">Business Solutions</p>
          <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">
            Built for every type of logistics operation
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Whether you&apos;re a two-van courier startup or managing a cross-regional fleet, Fauward scales with you.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {BUSINESS_SOLUTIONS.map((sol, i) => {
            const Icon = ICON_MAP[sol.slug] ?? Package;
            const gradient = ACCENT_COLORS[i % ACCENT_COLORS.length];
            return (
              <div
                key={sol.slug}
                className={`card-lift group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-8 ${gradient}`}
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm text-gray-700">
                  <Icon size={22} />
                </div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">{sol.audience}</p>
                <h3 className="mb-3 text-xl font-bold leading-snug text-gray-900">{sol.title}</h3>
                <p className="mb-5 text-sm leading-relaxed text-gray-700">{sol.summary}</p>
                <ul className="mb-6 space-y-2">
                  {sol.outcomes.map((o) => (
                    <li key={o} className="flex items-start gap-2 text-sm text-gray-800">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" viewBox="0 0 16 16" fill="currentColor">
                        <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207z" />
                      </svg>
                      {o}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/business#${sol.slug}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 group-hover:shadow-md"
                >
                  {sol.cta}
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
