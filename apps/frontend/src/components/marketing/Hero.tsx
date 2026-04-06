import Link from "next/link";

import { STAT_HIGHLIGHTS } from "@/lib/marketing-data";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white py-16 lg:py-28">
      <div className="absolute inset-0 -z-10 bg-grid opacity-60" aria-hidden />
      <div className="marketing-container">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            White-label logistics SaaS — for operators, not developers
          </p>

          <h1 className="text-4xl font-bold leading-tight text-gray-900 md:text-5xl lg:text-6xl">
            Stop duct-taping spreadsheets
            <br />
            to WhatsApp.
            <br />
            <span className="text-amber-600">Run real logistics software.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
            Fauward gives your freight or courier business a fully branded platform — shipment ops,
            customer tracking, invoicing, driver app, and booking widget. No code. No per-seat fees.
            Live in 10 minutes.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-lg bg-amber-600 px-7 text-base font-semibold text-white transition hover:bg-amber-700"
            >
              Start Free — No card needed
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-lg border border-gray-300 px-7 text-base font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Book a demo
            </Link>
          </div>

          <p className="mt-3 text-sm text-gray-500">14-day free trial · No card required · Cancel anytime</p>
        </div>

        {STAT_HIGHLIGHTS.length > 0 ? (
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 md:grid-cols-4">
            {STAT_HIGHLIGHTS.map((stat) => (
              <div key={stat.label} className="flex flex-col items-center bg-white px-4 py-6 text-center">
                <span
                  className={`text-3xl font-bold text-brand-navy ${stat.mono ? "font-mono" : ""}`}
                >
                  {stat.value}
                </span>
                <span className="mt-1.5 text-xs leading-snug text-gray-500">{stat.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mx-auto mt-12 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
            <div className="mx-3 flex h-6 flex-1 items-center rounded border border-gray-300 bg-white px-3 text-xs text-gray-500">
              app.fauward.com/dashboard
            </div>
          </div>
          <div className="flex aspect-[16/8] w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-navy/10">
              <svg className="h-8 w-8 text-brand-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" />
              </svg>
            </div>
            <p className="text-base font-semibold text-brand-navy">Product screenshot coming soon</p>
            <p className="mt-2 text-sm text-gray-400">Your branded ops dashboard — shipments, drivers, invoices, live tracking</p>
          </div>
        </div>
      </div>
    </section>
  );
}
