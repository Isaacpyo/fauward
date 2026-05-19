import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Clock, CheckCircle2, Camera, MessageSquare, Shield, Palette, Check } from "lucide-react";

import CTABanner from "@/components/marketing/CTABanner";
import CustomerTrackingSection from "@/components/marketing/CustomerTrackingSection";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Customer Tracking — Branded Shipment Tracking for Your Customers",
    description:
      "Give every customer a branded tracking link with live status, ETA, proof of delivery, and two-way messaging. No login required. Fully white-labelled under your brand.",
    path: "/customer-tracking",
    keywords: ["customer tracking portal", "branded tracking link", "shipment tracking page", "white-label tracking"],
  });
}

const FEATURES = [
  { icon: Link2,        label: "Unique tracking link per shipment", desc: "Every booking generates a shareable link — send it by SMS, email, or WhatsApp." },
  { icon: Clock,        label: "Live status and ETA",               desc: "Customers see real-time shipment status and an estimated delivery window." },
  { icon: CheckCircle2, label: "Delivery timeline",                 desc: "Clear progress from Booked through to Delivered with timestamps." },
  { icon: Camera,       label: "Proof of delivery",                 desc: "Customers can view the photo and signature captured by the driver on delivery." },
  { icon: MessageSquare,label: "Two-way support relay",             desc: "Customers can send messages through the tracking page, directly to your team." },
  { icon: Shield,       label: "No login required",                 desc: "Customers access the page via a unique link — no account creation or app download." },
  { icon: Palette,      label: "Fully branded",                     desc: "Your logo, colours, and domain — customers see your brand, not Fauward." },
];

export default function CustomerTrackingPage() {
  return (
    <>
      {/* Page hero */}
      <section className="relative overflow-hidden bg-white py-20 lg:py-28 border-b border-gray-100">
        <div className="absolute inset-0 -z-10 bg-grid opacity-50" aria-hidden />
        <div
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-100 opacity-60 blur-3xl"
          aria-hidden
        />
        <div className="marketing-container">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Customer Tracking · White-Label
            </p>
            <h1 className="text-4xl font-bold leading-tight text-gray-900 md:text-5xl">
              Give customers a tracking link,
              <br />
              <span className="text-amber-600">not another phone call.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-500">
              Every shipment gets a branded public tracking page. Customers see their delivery status, ETA, and proof — without calling your team or downloading an app.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-lg bg-amber-600 px-7 text-base font-semibold text-white transition hover:bg-amber-700"
              >
                Start Free Trial
              </Link>
              <Link
                href="/support#contact"
                className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-lg border border-gray-300 px-7 text-base font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Book a Demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main mockup section */}
      <CustomerTrackingSection />

      {/* Features grid */}
      <FadeInOnScroll>
        <section className="bg-white py-20 border-t border-gray-100">
          <div className="marketing-container">
            <div className="mx-auto max-w-2xl text-center mb-12">
              <h2 className="text-2xl font-bold text-gray-900 md:text-3xl">
                Everything your customers need, nothing they don&apos;t
              </h2>
              <p className="mt-3 text-base text-gray-500">
                The tracking page is clean, fast, and fully branded — built to reduce inbound calls and build trust with every delivery.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 border border-amber-100">
                    <Icon size={16} className="text-amber-600" />
                  </div>
                  <h3 className="mb-1 text-sm font-semibold text-gray-800">{label}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 rounded-2xl border border-amber-100 bg-amber-50 px-8 py-6">
              <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-amber-900 mb-1">Integrated with your operations</h3>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    The customer tracking page updates automatically as your drivers scan, confirm, and capture proof — no manual status updates required.
                  </p>
                </div>
                <Link
                  href="/signup"
                  className="shrink-0 inline-flex h-10 items-center rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  Get started
                </Link>
              </div>
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
