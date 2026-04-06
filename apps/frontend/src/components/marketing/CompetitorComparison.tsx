import { COMPETITOR_COMPARISON_ROWS } from "@/lib/marketing-data";

const NEGATIVE_WORDS = ["Patchy", "Manual", "None", "Extra", "Slow", "Per seat"];

function isNegative(value: string) {
  return NEGATIVE_WORDS.some((word) => value.includes(word));
}

export default function CompetitorComparison() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">
            Why not just use generic SaaS?
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Most logistics teams try to bolt together a CRM, a spreadsheet, and a delivery app. Here&apos;s how that compares.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-gray-200">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto] bg-gray-50 px-6 py-4">
            <span className="text-sm font-semibold text-gray-500">Capability</span>
            <span className="w-36 text-center text-sm font-semibold text-gray-500">Generic SaaS</span>
            <span className="w-36 rounded-t-lg bg-brand-navy px-4 py-2 text-center text-sm font-semibold text-white">Fauward</span>
          </div>

          {/* Rows */}
          {COMPETITOR_COMPARISON_ROWS.map((row, i) => (
            <div
              key={row.criterion}
              className={`grid grid-cols-[1fr_auto_auto] items-start gap-x-4 px-6 py-4 ${
                i % 2 === 0 ? "bg-white" : "bg-amber-50/30"
              }`}
            >
              <span className="text-sm font-medium text-gray-800">{row.criterion}</span>
              <span className="flex w-36 items-center justify-center gap-1.5 text-center text-sm text-gray-500">
                {isNegative(row.genericSaaS) && (
                  <svg className="h-3.5 w-3.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                )}
                {row.genericSaaS}
              </span>
              <span className="flex w-36 items-center justify-center gap-1.5 text-center text-sm font-semibold text-brand-navy">
                <svg className="h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                {row.fauward}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
