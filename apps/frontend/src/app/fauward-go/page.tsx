import type { Metadata } from "next";
import Link from "next/link";
import { QrCode, WifiOff, Camera, ShieldCheck, MapPin, AlertTriangle, Check } from "lucide-react";

import CTABanner from "@/components/marketing/CTABanner";
import FauwardGoSection from "@/components/marketing/FauwardGoSection";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Fauward Go — Field Operations App for Drivers and Agents",
    description:
      "Fauward Go is the offline-first PWA for drivers, couriers, and field agents. QR scan, OTP confirmation, photo proof of delivery, signature capture, and automatic sync — all in one app.",
    path: "/fauward-go",
    keywords: ["driver app", "proof of delivery app", "courier driver app", "offline delivery app", "field agent app"],
  });
}

const TRUST_POINTS = [
  { icon: WifiOff,       label: "Offline-first",      desc: "Works without mobile signal. All actions queue and sync automatically when back online." },
  { icon: QrCode,        label: "QR scanning",         desc: "Scan barcodes and QR codes at collection and delivery — no manual entry needed." },
  { icon: ShieldCheck,   label: "OTP confirmation",    desc: "Verify recipient identity with one-time passcodes before releasing a shipment." },
  { icon: Camera,        label: "Photo + signature",   desc: "Capture photo evidence and digital signature for every delivery." },
  { icon: MapPin,        label: "GPS tracking",        desc: "Continuous location updates during the route — visible to dispatchers in real time." },
  { icon: AlertTriangle, label: "Failed delivery flow",desc: "Capture the reason, photograph the attempt, and escalate automatically through the platform." },
];

export default function FauwardGoPage() {
  return (
    <>
      {/* Page hero */}
      <section className="relative overflow-hidden bg-dark-bg py-20 lg:py-28">
        <div className="absolute inset-0 -z-10 bg-dark-grid" aria-hidden />
        <div
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-96 w-[600px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(ellipse, #f59e0b 0%, #0d1f3c 70%, transparent 100%)' }}
          aria-hidden
        />
        <div className="marketing-container">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-5 inline-flex items-center rounded-full border border-amber-700/40 bg-amber-950/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">
              Fauward Go · Field Operations PWA
            </p>
            <h1 className="text-4xl font-bold leading-tight text-white md:text-5xl">
              Every driver, every delivery,
              <br />
              <span className="text-amber-400">fully connected.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-blue-100/70">
              Fauward Go gives field agents the tools to collect, deliver, capture proof, and sync — even when they have no signal.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-lg bg-amber-500 px-7 text-base font-semibold text-gray-900 transition hover:bg-amber-400"
              >
                Start Free Trial
              </Link>
              <Link
                href="/support#contact"
                className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-lg border border-dark-border bg-dark-surface px-7 text-base font-semibold text-white transition hover:bg-dark-card"
              >
                Book a Demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main product section (component) */}
      <FauwardGoSection />

      {/* Technical trust signals */}
      <FadeInOnScroll>
        <section className="bg-white py-20 border-t border-gray-100">
          <div className="marketing-container">
            <div className="mx-auto max-w-2xl text-center mb-12">
              <h2 className="text-2xl font-bold text-gray-900 md:text-3xl">
                Built for the realities of field logistics
              </h2>
              <p className="mt-3 text-base text-gray-500">
                No signal? No problem. Fauward Go handles every scenario drivers face in the real world.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {TRUST_POINTS.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-6">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 border border-amber-100">
                    <Icon size={18} className="text-amber-600" />
                  </div>
                  <h3 className="mb-1.5 text-sm font-semibold text-gray-800">{label}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 px-8 py-6 text-center">
              <p className="text-sm text-gray-600 leading-relaxed max-w-xl mx-auto">
                Fauward Go is a Progressive Web App (PWA) — no app store approval needed. Drivers access it through their mobile browser and can add it to their home screen in one tap.
              </p>
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      <FadeInOnScroll>
        <CTABanner />
      </FadeInOnScroll>
    </>
  );
}
