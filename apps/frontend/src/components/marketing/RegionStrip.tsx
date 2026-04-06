import Link from "next/link";

import { REGIONS } from "@/lib/marketing-data";

const REGION_FLAGS: Record<string, string> = {
  uk: "🇬🇧",
  africa: "🌍",
  mena: "🌙",
  global: "🌐",
};

export default function RegionStrip() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-gray-900">Built for UK, Africa, MENA, and global teams</h2>
            <p className="mt-3 max-w-3xl text-lg text-gray-600">
              Launch consistent tenant operations across regions while keeping local workflows and compliance needs in view.
            </p>
          </div>
          <Link href="/regions/global" className="text-sm font-semibold text-brand-navy underline-offset-4 hover:underline">
            Explore regions
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {REGIONS.map((region) => (
            <Link
              key={region.slug}
              href={`/regions/${region.slug}`}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 transition-all duration-200 hover:border-brand-navy"
            >
              {/* Amber left border slide in */}
              <span
                className="absolute inset-y-0 left-0 w-1 origin-left scale-y-0 bg-amber-600 transition-transform duration-200 group-hover:scale-y-100 rounded-l-xl"
                aria-hidden
              />

              <div className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-600">
                {REGION_FLAGS[region.slug] ?? ""} {region.label}
              </div>
              <h3 className="mt-4 text-xl font-semibold text-gray-900">{region.name}</h3>
              <p className="mt-2 text-sm text-gray-600">{region.summary}</p>
              {"badges" in region && Array.isArray(region.badges) && region.badges.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(region.badges as string[]).map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-navy">
                View details
                <svg
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
