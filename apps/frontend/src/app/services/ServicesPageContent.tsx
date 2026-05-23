"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Package,
  Smartphone,
  FileText,
  MapPin,
  Layout,
  Code,
  Briefcase,
  LayoutGrid,
  Map,
  CheckCircle2,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import PricingCards from "@/components/marketing/PricingCards";
import { SERVICES, BUSINESS_SOLUTIONS } from "@/lib/marketing-data";

import ServicesHero from "./ServicesHero";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  package: Package,
  smartphone: Smartphone,
  "file-text": FileText,
  "map-pin": MapPin,
  layout: Layout,
  code: Code,
};

const AUDIENCE_ICON_MAP: Record<string, LucideIcon> = {
  "courier-startups": Package,
  "freight-operators": Briefcase,
  "3pl-providers": LayoutGrid,
  "enterprise-fleets": Map,
};

const AUDIENCE_ACCENT: Record<string, { from: string; to: string; text: string; ring: string }> = {
  "courier-startups":   { from: "#fffbeb", to: "#fef3c7", text: "#b45309", ring: "#fde68a" },
  "freight-operators":  { from: "#eff6ff", to: "#dbeafe", text: "#1d4ed8", ring: "#bfdbfe" },
  "3pl-providers":      { from: "#f5f3ff", to: "#ede9fe", text: "#6d28d9", ring: "#ddd6fe" },
  "enterprise-fleets":  { from: "#ecfdf5", to: "#d1fae5", text: "#047857", ring: "#a7f3d0" },
};

const AUDIENCE_CTA_HREF: Record<string, string> = {
  "courier-startups": "/signup",
  "freight-operators": "/signup",
  "3pl-providers": "/support#contact",
  "enterprise-fleets": "/support#contact",
};

const headerContainer = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};
const headerItem = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

function GradientHeading({ before, gradient, after }: { before: string; gradient: string; after?: string }) {
  return (
    <>
      {before}{" "}
      <span className="relative inline-block">
        <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
          {gradient}
        </span>
        <motion.span
          aria-hidden
          className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
          initial={{ width: 0 }}
          whileInView={{ width: "100%" }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 1, delay: 0.5, ease: EASE }}
        />
      </span>
      {after ? ` ${after}` : ""}
    </>
  );
}

export default function ServicesPageContent() {
  return (
    <>
      <ServicesHero />

      {/* ── Platform capabilities ────────────────────────────────────── */}
      <section className="bg-white py-20 lg:py-28">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                <span className="relative z-10">Platform capabilities</span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                  style={{ background: "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.85) 50%, transparent 65%, transparent 100%)" }}
                />
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              <GradientHeading before="Every module is" gradient="built for logistics" />
            </motion.h2>
            <motion.p variants={headerItem} className="mt-4 text-lg text-gray-600">
              Not adapted from a generic SaaS — designed for the realities of freight and courier operations.
            </motion.p>
          </motion.div>

          <div className="mt-16 space-y-24 lg:space-y-32">
            {SERVICES.map((service, i) => {
              const Icon = SERVICE_ICON_MAP[service.icon] ?? Package;
              const reverse = i % 2 === 1;
              return (
                <motion.div
                  key={service.slug}
                  id={service.slug}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.2 }}
                  className={`grid items-center gap-12 lg:grid-cols-2 lg:gap-16 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}
                >
                  {/* Text */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, x: reverse ? 40 : -40, filter: "blur(10px)" },
                      show:   { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE } },
                    }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.05, rotate: -3 }}
                      transition={{ type: "spring", stiffness: 320, damping: 20 }}
                      className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 shadow-sm"
                    >
                      <Icon size={28} />
                    </motion.div>
                    <h3 className="text-2xl font-bold text-gray-900 lg:text-3xl">{service.title}</h3>
                    <p className="mt-4 text-lg leading-relaxed text-gray-600">{service.summary}</p>
                    <ul className="mt-6 space-y-3">
                      {service.bullets.map((b, bi) => (
                        <motion.li
                          key={b}
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true, amount: 0.3 }}
                          transition={{ delay: 0.3 + bi * 0.07, duration: 0.5, ease: EASE }}
                          className="flex items-start gap-3 text-sm text-gray-700"
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                            <CheckCircle2 size={12} strokeWidth={3} />
                          </span>
                          {b}
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>

                  {/* Visual card */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, x: reverse ? -40 : 40, scale: 0.95, filter: "blur(10px)" },
                      show:   { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.8, delay: 0.15, ease: EASE } },
                    }}
                    className="relative"
                  >
                    <motion.div
                      aria-hidden
                      className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl blur-3xl"
                      style={{ background: "linear-gradient(135deg, #fffbeb, #fef3c7)" }}
                      animate={{ opacity: [0.55, 0.85, 0.55] }}
                      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                      whileHover={{ y: -4 }}
                      transition={{ type: "spring", stiffness: 280, damping: 22 }}
                      className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-slate-50 p-8 shadow-sm"
                    >
                      <div className="mb-6 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow">
                          <Icon size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{service.title}</p>
                          <p className="text-xs text-gray-500">Fauward Platform</p>
                        </div>
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                          </span>
                          Active
                        </span>
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: "Status",  value: "Operational" },
                          { label: "Uptime",  value: "99.9%" },
                          { label: "Region",  value: "UK & Europe · Africa · Asia" },
                        ].map((row, ri) => (
                          <motion.div
                            key={row.label}
                            initial={{ opacity: 0, x: -8 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, amount: 0.3 }}
                            transition={{ delay: 0.4 + ri * 0.08, duration: 0.4, ease: EASE }}
                            className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 shadow-sm"
                          >
                            <span className="text-xs text-gray-500">{row.label}</span>
                            <span className="text-xs font-semibold text-gray-900">{row.value}</span>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Audience fit ─────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-20 lg:py-28">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                Who it&apos;s built for
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              <GradientHeading before="Built for every stage of" gradient="your operation" />
            </motion.h2>
            <motion.p variants={headerItem} className="mt-4 text-lg text-gray-600">
              From a two-van courier startup to a cross-regional fleet — Fauward scales with you, without re-platforming.
            </motion.p>
          </motion.div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {BUSINESS_SOLUTIONS.map((sol, i) => {
              const Icon = AUDIENCE_ICON_MAP[sol.slug] ?? Package;
              const accent = AUDIENCE_ACCENT[sol.slug];
              const ctaHref = AUDIENCE_CTA_HREF[sol.slug] ?? "/signup";
              return (
                <motion.div
                  key={sol.slug}
                  id={sol.slug}
                  initial={{ opacity: 0, y: 32, scale: 0.96, filter: "blur(10px)" }}
                  whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: i * 0.12, duration: 0.7, ease: EASE }}
                  whileHover={{ y: -6 }}
                  className="group relative overflow-hidden rounded-2xl border bg-white p-8 shadow-sm transition hover:shadow-lg"
                  style={{ borderColor: accent.ring }}
                >
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute -inset-px -z-10 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
                  />
                  <div className="relative">
                    <motion.div
                      whileHover={{ scale: 1.06, rotate: -4 }}
                      transition={{ type: "spring", stiffness: 320, damping: 20 }}
                      className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`, color: accent.text }}
                    >
                      <Icon size={22} />
                    </motion.div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: accent.text }}>
                      {sol.audience}
                    </p>
                    <h3 className="mb-3 text-xl font-bold leading-snug text-gray-900">{sol.title}</h3>
                    <p className="mb-5 text-sm leading-relaxed text-gray-700">{sol.summary}</p>
                    <ul className="mb-6 space-y-2">
                      {sol.outcomes.map((o, oi) => (
                        <motion.li
                          key={o}
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true, amount: 0.3 }}
                          transition={{ delay: 0.4 + oi * 0.07, duration: 0.4, ease: EASE }}
                          className="flex items-start gap-2 text-sm text-gray-800"
                        >
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: accent.text, color: "#ffffff" }}>
                            <CheckCircle2 size={11} strokeWidth={3} />
                          </span>
                          {o}
                        </motion.li>
                      ))}
                    </ul>
                    <MotionLink
                      href={ctaHref}
                      initial="rest"
                      animate="rest"
                      whileHover="hover"
                      className="relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-lg border bg-white px-6 text-sm font-semibold shadow-sm"
                      variants={{
                        rest:  { borderColor: "#e5e7eb", color: "#111827" },
                        hover: { borderColor: accent.text, color: "#ffffff" },
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 -z-0"
                        variants={{ rest: { y: "100%" }, hover: { y: "0%" } }}
                        transition={{ duration: 0.4, ease: EASE }}
                        style={{ background: accent.text }}
                      />
                      <span className="relative z-10 inline-flex items-center gap-2">
                        {sol.cta}
                        <motion.span variants={{ rest: { x: 0 }, hover: { x: 4 } }} transition={{ duration: 0.3 }}>
                          <ArrowRight size={14} />
                        </motion.span>
                      </span>
                    </MotionLink>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Pricing strip ───────────────────────────────────────────── */}
      <section className="bg-white py-20 lg:py-24">
        <div className="marketing-container">
          <motion.div
            className="mb-10 text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                Pricing
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              <GradientHeading before="One flat price for" gradient="every team size" />
            </motion.h2>
            <motion.p variants={headerItem} className="mt-3 text-lg text-gray-600">
              No per-seat fees. Add as many dispatchers as you need.
            </motion.p>
          </motion.div>
          <PricingCards condensed showToggle={false} showPricingLink />
        </div>
      </section>
    </>
  );
}
