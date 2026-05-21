import Link from "next/link";

type CTABannerProps = {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export default function CTABanner({
  title = "Ready to launch your own logistics platform?",
  description = "Set your brand, invite your team, and process your first live shipment — in under 10 minutes. No card required.",
  ctaLabel = "Start Free Trial",
  ctaHref = "/signup",
  secondaryLabel = "Talk to sales",
  secondaryHref = "/support#contact"
}: CTABannerProps) {
  return (
    <>
      <style>{`
        @keyframes cta-banner-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.4); }
          50% { box-shadow: 0 0 0 10px rgba(251,191,36,0); }
        }
        .banner-cta-pulse { animation: cta-banner-pulse 2s ease-in-out infinite; }
      `}</style>
      <section className="py-16 lg:py-24">
        <div className="marketing-container">
          <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 px-6 py-12 md:px-16 md:py-16">
            {/* Amber radial glow top-right */}
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-300/30 blur-3xl"
              aria-hidden
            />

            <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">{title}</h2>
                <p className="mt-4 text-lg leading-relaxed text-gray-700">{description}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
                <Link
                  href={ctaHref}
                  className="banner-cta-pulse inline-flex h-12 items-center justify-center rounded-lg bg-amber-500 px-7 text-base font-semibold text-gray-900 transition hover:bg-amber-400"
                >
                  {ctaLabel}
                </Link>
                {secondaryLabel && secondaryHref && (
                  <Link
                    href={secondaryHref}
                    className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 bg-white px-7 text-base font-semibold text-gray-800 transition hover:bg-gray-50"
                  >
                    {secondaryLabel}
                  </Link>
                )}
              </div>
            </div>

            {/* Trust badges */}
            <div className="relative mt-6 flex flex-wrap items-center gap-4">
              <span className="text-sm text-gray-600">🔒 No card required</span>
              <span className="text-sm text-gray-600">✓ 14-day free trial</span>
              <span className="text-sm text-gray-600">✓ Cancel anytime</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
