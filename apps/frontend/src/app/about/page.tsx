import type { Metadata } from "next";
import Link from "next/link";
import { Zap, Shield, Globe, Users } from "lucide-react";
import CTABanner from "@/components/marketing/CTABanner";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import StructuredData from "@/components/seo/StructuredData";
import { TEAM_MEMBERS, COMPANY_VALUES } from "@/lib/marketing-data";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

const VALUE_ICON_MAP: Record<string, React.ElementType> = {
  zap: Zap,
  shield: Shield,
  globe: Globe,
  users: Users,
};

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "About Us",
    description: "The story behind Fauward — who we are, what we believe, and why we're building the logistics platform operators deserve.",
    path: "/about",
  });
}

export default function AboutPage() {
  return (
    <>
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ])}
      />
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
        <div className="marketing-container relative">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-400">
              About Us
            </p>
            <h1 className="text-4xl font-bold leading-tight text-white lg:text-5xl">
              We build software for the people who keep things moving
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-blue-200">
              Fauward was built by logistics operators who spent years frustrated by software that wasn&apos;t built for the realities of running freight and courier businesses. We decided to fix it.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <FadeInOnScroll>
        <section className="bg-white py-20 lg:py-24">
          <div className="marketing-container">
            <div className="mx-auto max-w-4xl">
              <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Our mission</h2>
                  <p className="mt-5 text-lg leading-relaxed text-gray-600">
                    Logistics is the backbone of global commerce — yet most operators run on spreadsheets, WhatsApp groups, and a patchwork of tools that don&apos;t talk to each other.
                  </p>
                  <p className="mt-4 text-lg leading-relaxed text-gray-600">
                    Our mission is to give every logistics business — from a two-van courier startup in Manchester to a cross-regional freight operator in Lagos — professional-grade software that was previously only accessible to enterprises with engineering teams.
                  </p>
                  <p className="mt-4 text-lg leading-relaxed text-gray-600">
                    No code. No per-seat traps. No months of implementation. Live in 10 minutes.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: "10 min", label: "Median time to first live shipment" },
                    { value: "4+", label: "Regions supported globally" },
                    { value: "99.9%", label: "Target uptime SLA" },
                    { value: "£0", label: "Per-seat charges — ever" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl bg-gray-50 p-6 text-center">
                      <p className="text-3xl font-bold text-brand-navy">{stat.value}</p>
                      <p className="mt-1.5 text-xs leading-snug text-gray-500">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      {/* Values */}
      <FadeInOnScroll>
        <section className="bg-gray-50 py-20 lg:py-24">
          <div className="marketing-container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-gray-900">What we believe</h2>
              <p className="mt-4 text-lg text-gray-600">Our values aren&apos;t a poster on a wall — they&apos;re how we make every product decision.</p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {COMPANY_VALUES.map((val) => {
                const Icon = VALUE_ICON_MAP[val.icon] ?? Zap;
                return (
                  <div key={val.title} className="card-lift rounded-2xl bg-white p-7 shadow-sm border border-gray-200">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                      <Icon size={24} />
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-gray-900">{val.title}</h3>
                    <p className="text-sm leading-relaxed text-gray-600">{val.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      {/* Today at Fauward — live-feel metrics block */}
      <FadeInOnScroll>
        <section className="bg-white py-20 lg:py-24">
          <div className="marketing-container">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold text-gray-900">Today at Fauward</h2>
              <p className="mt-3 text-lg text-gray-600">
                Real numbers from operators running their logistics businesses on the platform right now.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { value: "4+ regions", label: "UK, Africa, MENA & Global deployments", mono: false },
                { value: "99.9%", label: "Target uptime SLA for Enterprise tenants", mono: true },
                { value: "10 min", label: "Median time from signup to first live shipment", mono: true },
                { value: "£0", label: "Per-seat charges — on any plan, ever", mono: true },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col items-center rounded-2xl border border-gray-200 bg-gray-50 p-7 text-center">
                  <span className={`text-3xl font-bold text-brand-navy ${stat.mono ? "font-mono" : ""}`}>
                    {stat.value}
                  </span>
                  <span className="mt-2 text-xs leading-snug text-gray-500">{stat.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { icon: "🇬🇧", region: "United Kingdom", note: "VAT-ready invoicing · GoCardless · Royal Mail, DPD, Evri" },
                { icon: "🌍", region: "Africa", note: "M-Pesa · Paystack · Offline-first driver app · COD workflows" },
                { icon: "🌏", region: "MENA", note: "COD · Checkout.com · HyperPay · Aramex · Arabic notifications" },
              ].map((r) => (
                <div key={r.region} className="rounded-xl border border-gray-200 bg-white px-5 py-4">
                  <p className="text-lg">{r.icon}</p>
                  <p className="mt-1 font-bold text-gray-900">{r.region}</p>
                  <p className="mt-1 text-xs text-gray-500">{r.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      {/* Team */}
      <FadeInOnScroll>
        <section className="bg-gray-50 py-20 lg:py-24">
          <div className="marketing-container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-gray-900">Meet the team</h2>
              <p className="mt-4 text-lg text-gray-600">Operators, engineers, and builders who&apos;ve lived the problem we&apos;re solving.</p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {TEAM_MEMBERS.map((member) => (
                <div key={member.name} className="card-lift rounded-2xl bg-white p-6 shadow-sm border border-gray-200 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0d1f3c] text-lg font-bold text-white">
                    {member.initials}
                  </div>
                  <h3 className="font-bold text-gray-900">{member.name}</h3>
                  <p className="mt-0.5 text-xs font-semibold text-amber-600">{member.role}</p>
                  <p className="mt-3 text-xs leading-relaxed text-gray-600">{member.bio}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      {/* Investors / backed-by strip */}
      <FadeInOnScroll>
        <section className="bg-white py-16">
          <div className="marketing-container text-center">
            <p className="mb-6 text-xs font-bold uppercase tracking-widest text-gray-400">Trusted by operators across three regions</p>
            <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
              {["Northline Freight", "Atlas Dispatch", "Relay Fleet", "PortBridge Logistics", "Gulf Link Logistics"].map((name) => (
                <span key={name} className="text-sm font-semibold text-gray-500">{name}</span>
              ))}
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      <FadeInOnScroll>
        <CTABanner
          title="Want to join the team?"
          description="We&apos;re a remote-first company building for operators worldwide. If the problem excites you, reach out."
          ctaLabel="See Open Roles"
          ctaHref="/support#contact"
        />
      </FadeInOnScroll>
    </>
  );
}
