import Link from "next/link";

import { STAT_HIGHLIGHTS } from "@/lib/marketing-data";

const shipmentRows = [
  { id: "FW-10482", status: "In Transit", statusColor: "bg-amber-100 text-amber-700", destination: "Manchester, UK" },
  { id: "FW-10481", status: "Delivered", statusColor: "bg-green-100 text-green-700", destination: "Lagos, NG" },
  { id: "FW-10480", status: "Pending", statusColor: "bg-gray-100 text-gray-600", destination: "Dubai, UAE" },
  { id: "FW-10479", status: "In Transit", statusColor: "bg-amber-100 text-amber-700", destination: "Birmingham, UK" },
];

export default function Hero() {
  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .mockup-float { animation: float 3.5s ease-in-out infinite; }
      `}</style>
      <section className="relative overflow-hidden bg-white py-16 lg:py-28">
        <div className="absolute inset-0 -z-10 bg-grid opacity-60" aria-hidden />
        <div className="marketing-container">
          <div className="mx-auto max-w-4xl text-center">
            {/* Radial glow behind heading */}
            <div
              className="pointer-events-none absolute left-1/2 top-32 -z-10 h-64 w-96 -translate-x-1/2 rounded-full bg-amber-100 opacity-60 blur-3xl"
              aria-hidden
            />

            <p className="mb-5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              White-label logistics SaaS — for operators, not developers
            </p>

            <h1 className="text-4xl font-bold leading-tight text-gray-900 md:text-5xl lg:text-6xl">
              The logistics platform
              <br />
              <span className="text-amber-600">that runs itself.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
              Fully branded, all-in-one, and powered by agents that handle the ops you don't have time for.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-lg bg-amber-600 px-7 text-base font-semibold text-white transition hover:bg-amber-700"
              >
                Start Free — No card needed
              </Link>
              <Link
                href="/support#contact"
                className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-lg border border-gray-300 px-7 text-base font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Talk to sales
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

          {/* Animated dashboard mockup */}
          <div className="mockup-float mx-auto mt-12 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
              <div className="mx-3 flex h-6 flex-1 items-center rounded border border-gray-300 bg-white px-3 text-xs text-gray-500">
                app.fauward.com/dashboard
              </div>
            </div>
            <div className="bg-gray-50 p-5">
              {/* Stats row */}
              <div className="mb-4 grid grid-cols-3 gap-3">
                {[
                  { label: "Shipments Today", value: "142" },
                  { label: "Active Drivers", value: "37" },
                  { label: "Revenue MTD", value: "£28,450" },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl bg-white p-4 shadow-sm">
                    <p className="text-xs text-gray-500">{card.label}</p>
                    <p className="mt-1 text-xl font-bold text-brand-navy">{card.value}</p>
                  </div>
                ))}
              </div>
              {/* Shipment list */}
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <div className="grid grid-cols-3 border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <span>Shipment ID</span>
                  <span>Destination</span>
                  <span>Status</span>
                </div>
                {shipmentRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-3 items-center border-b border-gray-50 px-4 py-3 last:border-0">
                    <span className="text-sm font-mono font-medium text-gray-700">{row.id}</span>
                    <span className="text-sm text-gray-600">{row.destination}</span>
                    <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.statusColor}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
