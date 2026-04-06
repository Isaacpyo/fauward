const FEATURE_PILLS = [
  "White-label branding",
  "No per-seat fees",
  "Live in 10 minutes",
  "Multi-currency",
  "Driver PWA included",
  "Customer booking widget",
  "Real-time tracking",
  "Automated invoicing",
  "Custom pricing rules",
  "API access",
];

export default function SocialProof() {
  return (
    <section className="border-y border-gray-200 bg-gray-50 py-10">
      <div className="marketing-container">
        <p className="text-center text-sm font-medium uppercase tracking-[0.16em] text-gray-500">
          Everything your operations team needs — out of the box
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {FEATURE_PILLS.map((pill) => (
            <span
              key={pill}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              <svg className="h-3.5 w-3.5 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              {pill}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
