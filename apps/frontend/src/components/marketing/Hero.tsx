import Link from "next/link";
import { CommandCentreMockup } from "./CommandCentreMockup";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-dark-bg py-20 lg:py-32">
      {/* Dark grid overlay */}
      <div className="absolute inset-0 -z-10 bg-dark-grid" aria-hidden />
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[600px] w-[900px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(ellipse, #3b82f6 0%, #0d1f3c 60%, transparent 100%)' }}
        aria-hidden
      />

      <div className="marketing-container">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <p className="mb-6 inline-flex items-center rounded-full border border-blue-800/60 bg-blue-950/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
            Logistics command centre · White-label SaaS
          </p>

          {/* Headline */}
          <h1 className="text-4xl font-bold leading-[1.1] text-white md:text-5xl lg:text-6xl">
            Stop running logistics from
            <br />
            <span className="text-amber-400">spreadsheets and WhatsApp.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-blue-100/80">
            Run shipments, drivers, tracking, invoicing, and customer updates from one branded command centre.
          </p>

          {/* CTAs */}
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-13 min-w-[220px] items-center justify-center rounded-lg bg-amber-500 px-8 text-base font-semibold text-gray-900 transition hover:bg-amber-400 focus-visible:outline-offset-4"
            >
              Start Free Trial
            </Link>
            <Link
              href="/support#contact"
              className="inline-flex h-13 min-w-[180px] items-center justify-center rounded-lg border border-blue-700/60 bg-blue-950/40 px-8 text-base font-semibold text-white transition hover:bg-blue-900/50"
            >
              Book a Demo
            </Link>
          </div>

          {/* Proof strip */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-blue-300/70">
            <span>No card required</span>
            <span className="hidden sm:inline text-blue-800">·</span>
            <span>14-day free trial</span>
            <span className="hidden sm:inline text-blue-800">·</span>
            <span>Live in hours</span>
          </div>
        </div>

        {/* Command centre mockup */}
        <div className="mx-auto mt-16 max-w-5xl">
          <CommandCentreMockup />
        </div>
      </div>
    </section>
  );
}
