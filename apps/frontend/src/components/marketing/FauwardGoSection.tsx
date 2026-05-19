import Link from 'next/link';
import { QrCode, ShieldCheck, Camera, WifiOff, MapPin, AlertTriangle, Check } from 'lucide-react';

const FEATURES = [
  { icon: QrCode,       text: 'QR scan for collection and delivery confirmation' },
  { icon: ShieldCheck,  text: 'OTP verification before releasing a shipment' },
  { icon: Camera,       text: 'Photo proof and digital signature capture' },
  { icon: WifiOff,      text: 'Offline-first — works with no signal, syncs when back online' },
  { icon: MapPin,       text: 'GPS location updates throughout the route' },
  { icon: AlertTriangle,text: 'Failed delivery reason capture and escalation' },
];

const JOBS = [
  { ref: 'FW-7821', address: '14 Brook St, Manchester', status: 'Out for delivery', statusClass: 'text-blue-400' },
  { ref: 'FW-7819', address: '2 Canal Rd, Leeds',       status: 'POD required',     statusClass: 'text-amber-400' },
];

export default function FauwardGoSection() {
  return (
    <section className="relative overflow-hidden bg-dark-bg py-20">
      <div className="absolute inset-0 -z-10 bg-dark-grid" aria-hidden />
      <div className="marketing-container">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">

          {/* Copy */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
              Fauward Go
            </p>
            <h2 className="text-3xl font-bold text-white md:text-4xl leading-tight">
              Field operations,
              <br />
              <span className="text-amber-400">built for the road.</span>
            </h2>
            <p className="mt-5 text-base text-blue-100/70 leading-relaxed">
              Fauward Go is the driver and field agent PWA. It works offline, captures proof, confirms OTP, and syncs automatically — so your team can focus on delivering, not reporting.
            </p>

            <ul className="mt-7 space-y-3">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-950/60 border border-amber-800/40">
                    <Icon size={12} className="text-amber-400" />
                  </div>
                  <span className="text-sm text-blue-100/70">{text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/fauward-go"
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-gray-900 transition hover:bg-amber-400"
              >
                Learn about Fauward Go
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-lg border border-dark-border bg-dark-surface px-6 py-3 text-sm font-semibold text-white transition hover:bg-dark-card"
              >
                Start free trial
              </Link>
            </div>
          </div>

          {/* Phone mockup */}
          <div className="flex justify-center lg:justify-end">
            <div className="phone-frame w-64">
              <div className="phone-notch" />

              {/* App header */}
              <div className="px-4 py-3 border-b border-dark-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Fauward Go</div>
                  <div className="text-xs text-gray-500">Marcus Osei · Driver</div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="live-dot w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-xs text-green-400">Online</span>
                </div>
              </div>

              {/* Summary chip */}
              <div className="px-4 py-2.5">
                <div className="rounded-lg border border-amber-800/40 bg-amber-950/40 px-3 py-2 text-center">
                  <span className="text-sm font-semibold text-amber-400">3 jobs today</span>
                  <span className="ml-2 text-xs text-amber-600">· 1 completed</span>
                </div>
              </div>

              {/* Job cards */}
              <div className="px-4 pb-3 space-y-2">
                {JOBS.map((job) => (
                  <div key={job.ref} className="rounded-lg border border-dark-border bg-dark-card p-3">
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-mono text-gray-300">{job.ref}</span>
                      <span className={`text-xs font-semibold ${job.statusClass}`}>{job.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-snug">{job.address}</p>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="border-t border-dark-border px-4 py-3 grid grid-cols-3 gap-1.5">
                {['Scan QR', 'Confirm OTP', 'Photo'].map((btn) => (
                  <button
                    key={btn}
                    className="rounded-md border border-dark-border bg-dark-surface py-1.5 text-xs text-gray-400 text-center transition hover:border-amber-700/40 hover:text-amber-400"
                  >
                    {btn}
                  </button>
                ))}
              </div>

              {/* Sync indicator */}
              <div className="border-t border-dark-border px-4 py-2 flex items-center gap-1.5">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="text-xs text-blue-400/60 font-mono">Syncing offline jobs…</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
