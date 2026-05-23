"use client";

import { motion } from "framer-motion";
import {
  Zap,
  Shield,
  Globe,
  Users,
  Sparkles,
  TrendingUp,
  Banknote,
  ServerCog,
  Compass,
  type LucideIcon,
} from "lucide-react";

import CompetitorComparison from "@/components/marketing/CompetitorComparison";
import { COMPANY_VALUES, COMPANY_MILESTONES } from "@/lib/marketing-data";

import AboutHero from "./AboutHero";

const EASE = [0.22, 1, 0.36, 1] as const;

const VALUE_ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap,
  shield: Shield,
  globe: Globe,
  users: Users,
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

const MISSION_STATS = [
  { value: "10 min", label: "Median time to first live shipment" },
  { value: "4+",     label: "Regions supported globally" },
  { value: "99.9%",  label: "Target uptime SLA" },
  { value: "£0",     label: "Per-seat charges — ever" },
];

const TODAY_STATS = [
  { value: "4+ regions", label: "UK & Europe, Africa, Asia & Global deployments", mono: false },
  { value: "99.9%",      label: "Target uptime SLA for Enterprise tenants",       mono: true  },
  { value: "10 min",     label: "Median time from signup to first live shipment",  mono: true  },
  { value: "£0",         label: "Per-seat charges — on any plan, ever",            mono: true  },
];

const REGION_CARDS = [
  { icon: "🇬🇧", region: "UK & Europe", note: "VAT-ready invoicing · GoCardless · Royal Mail, DPD, Evri, DHL Europe" },
  { icon: "🌍", region: "Africa",     note: "M-Pesa · Paystack · Offline-first driver app · COD workflows" },
  { icon: "🌏", region: "Asia",       note: "COD · Checkout.com · HyperPay · Aramex · Localised notifications" },
];

const STORY_STATS = [
  { value: "4+",     label: "Regions live",              icon: Globe       as LucideIcon, accent: { bg: "#eff6ff", text: "#1d4ed8" } },
  { value: "10 min", label: "Median onboarding",         icon: TrendingUp  as LucideIcon, accent: { bg: "#fffbeb", text: "#b45309" } },
  { value: "99.9%",  label: "Target uptime SLA",         icon: ServerCog   as LucideIcon, accent: { bg: "#ecfdf5", text: "#047857" } },
  { value: "£0",     label: "Per-seat charges — ever",   icon: Banknote    as LucideIcon, accent: { bg: "#f5f3ff", text: "#6d28d9" } },
];

const MILESTONE_ICONS: LucideIcon[] = [Compass, TrendingUp, Globe, ServerCog, Sparkles];
const MILESTONE_ACCENTS = [
  { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
  { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  { bg: "#ecfdf5", text: "#047857", border: "#a7f3d0" },
  { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" },
  { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
];


export default function AboutPageContent() {
  return (
    <>
      <AboutHero />

      {/* Mission */}
      <section className="bg-white py-20 lg:py-24">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-4xl"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
          >
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <motion.span
                  variants={headerItem}
                  className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-700"
                >
                  Mission
                </motion.span>
                <motion.h2 variants={headerItem} className="text-3xl font-bold text-gray-900 md:text-4xl">
                  <GradientHeading before="Software for the operators" gradient="who move the world" />
                </motion.h2>
                <motion.p variants={headerItem} className="mt-5 text-lg leading-relaxed text-gray-600">
                  Logistics is the backbone of global commerce — yet most operators run on spreadsheets, WhatsApp groups, and a patchwork of tools that don&apos;t talk to each other.
                </motion.p>
                <motion.p variants={headerItem} className="mt-4 text-lg leading-relaxed text-gray-600">
                  Our mission is to give every logistics business — from a two-van courier startup in Manchester to a cross-regional freight operator in Lagos — professional-grade software that was previously only accessible to enterprises with engineering teams.
                </motion.p>
                <motion.p variants={headerItem} className="mt-4 text-lg leading-relaxed text-gray-600">
                  No code. No per-seat traps. No months of implementation. Live in 10 minutes.
                </motion.p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {MISSION_STATS.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 24, scale: 0.95, filter: "blur(8px)" }}
                    whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ delay: 0.2 + i * 0.1, duration: 0.6, ease: EASE }}
                    whileHover={{ y: -4 }}
                    className="rounded-2xl border border-gray-100 bg-slate-50 p-6 text-center transition hover:shadow-md"
                  >
                    <p className="text-3xl font-bold text-brand-navy">{stat.value}</p>
                    <p className="mt-1.5 text-xs leading-snug text-gray-500">{stat.label}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Our Story — narrative + animated stat tiles */}
      <section className="relative overflow-hidden bg-slate-50 py-20 lg:py-24">
        <div className="absolute inset-0 -z-10 bg-grid opacity-50" aria-hidden />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-1/4 -z-10 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl"
          animate={{ opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-32 bottom-1/4 -z-10 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl"
          animate={{ opacity: [0.3, 0.55, 0.3] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />

        <div className="marketing-container relative">
          <motion.div
            className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
          >
            {/* Narrative */}
            <div>
              <motion.div variants={headerItem} className="mb-4 inline-block">
                <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  <Sparkles size={12} className="text-amber-500" />
                  <span className="relative z-10">Our story</span>
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
                <GradientHeading before="Built" gradient="operator-shaped" after="from day one" />
              </motion.h2>

              <motion.p variants={headerItem} className="mt-5 text-lg leading-relaxed text-gray-600">
                Fauward started with a pattern we kept seeing across courier, freight, and 3PL operations: teams running multi-million-pound businesses on WhatsApp threads, shared spreadsheets, and a patchwork of carrier portals — while paying enterprise prices for software that didn&apos;t actually fit how their day works.
              </motion.p>
              <motion.p variants={headerItem} className="mt-4 text-lg leading-relaxed text-gray-600">
                So we built the opposite. A platform shaped around how operators actually run a shipment — not adapted from a generic SaaS. Branded for your customers. Live in minutes, not months. Priced by volume, not by every person you add to the team.
              </motion.p>
              <motion.p variants={headerItem} className="mt-4 text-lg leading-relaxed text-gray-600">
                Fauward is logistics infrastructure for the people running the operation — without needing an engineering team to make it work.
              </motion.p>
            </div>

            {/* Animated stat tiles */}
            <motion.div
              variants={{
                hidden: { opacity: 0, x: 24, filter: "blur(8px)" },
                show:   { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.8, delay: 0.2, ease: EASE } },
              }}
              className="relative"
            >
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl blur-3xl"
                style={{ background: "linear-gradient(135deg, #fef3c7, #dbeafe)" }}
                animate={{ opacity: [0.55, 0.85, 0.55] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="grid grid-cols-2 gap-4">
                {STORY_STATS.map(({ value, label, icon: Icon, accent }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 24, scale: 0.95 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.55, ease: EASE }}
                    whileHover={{ y: -4 }}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div
                      className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: accent.bg, color: accent.text }}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="text-3xl font-bold text-brand-navy">{value}</div>
                    <div className="mt-1 text-xs leading-snug text-gray-500">{label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          {/* Journey timeline */}
          <div className="mx-auto mt-20 max-w-5xl">
            <motion.div
              className="mx-auto mb-12 max-w-2xl text-center"
              variants={headerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.4 }}
            >
              <motion.div variants={headerItem} className="mb-4 inline-block">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                  The journey
                </span>
              </motion.div>
              <motion.h3 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
                <GradientHeading before="From prototype to" gradient="platform" />
              </motion.h3>
              <motion.p variants={headerItem} className="mt-3 text-base text-gray-600">
                Five years of shipping the boring, reliable infrastructure operators actually need.
              </motion.p>
            </motion.div>

            <div className="relative">
              {/* Vertical connector line on lg+ */}
              <div className="pointer-events-none absolute left-1/2 top-2 hidden h-[calc(100%-1rem)] w-px -translate-x-1/2 lg:block">
                <motion.div
                  className="h-full w-px origin-top bg-gradient-to-b from-amber-300 via-blue-300 to-purple-300"
                  initial={{ scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 1.4, ease: EASE }}
                />
              </div>

              <div className="space-y-10 lg:space-y-14">
                {COMPANY_MILESTONES.map((m, i) => {
                  const Icon = MILESTONE_ICONS[i] ?? Sparkles;
                  const accent = MILESTONE_ACCENTS[i] ?? MILESTONE_ACCENTS[0];
                  const reverse = i % 2 === 1;
                  return (
                    <motion.div
                      key={m.year}
                      initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      viewport={{ once: true, amount: 0.3 }}
                      transition={{ delay: i * 0.1, duration: 0.6, ease: EASE }}
                      className={`grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr] ${reverse ? "lg:[&>*:first-child]:order-3" : ""}`}
                    >
                      {/* Card side */}
                      <div className={`lg:${reverse ? "text-left lg:pl-10" : "text-right lg:pr-10"}`}>
                        <motion.div
                          whileHover={{ y: -3 }}
                          transition={{ type: "spring", stiffness: 320, damping: 22 }}
                          className="inline-block rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
                        >
                          <div
                            className="mb-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                            style={{ background: accent.bg, color: accent.text, borderColor: accent.border }}
                          >
                            <Icon size={11} /> {m.year}
                          </div>
                          <p className="text-sm leading-relaxed text-gray-700">{m.event}</p>
                        </motion.div>
                      </div>

                      {/* Center node */}
                      <motion.div
                        initial={{ scale: 0 }}
                        whileInView={{ scale: 1 }}
                        viewport={{ once: true, amount: 0.5 }}
                        transition={{ delay: i * 0.1 + 0.2, type: "spring", stiffness: 320, damping: 18 }}
                        className="relative z-10 mx-auto hidden h-12 w-12 items-center justify-center rounded-2xl border-2 bg-white shadow-md lg:flex"
                        style={{ borderColor: accent.text, color: accent.text }}
                      >
                        <Icon size={18} />
                      </motion.div>

                      {/* Spacer on the opposite side (kept empty so the centred node is centred on the grid) */}
                      <div className="hidden lg:block" />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-slate-50 py-20 lg:py-24">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-700">
                Values
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              <GradientHeading before="What we" gradient="believe" />
            </motion.h2>
            <motion.p variants={headerItem} className="mt-4 text-lg text-gray-600">
              Our values aren&apos;t a poster on a wall — they&apos;re how we make every product decision.
            </motion.p>
          </motion.div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {COMPANY_VALUES.map((val, i) => {
              const Icon = VALUE_ICON_MAP[val.icon] ?? Zap;
              return (
                <motion.div
                  key={val.title}
                  initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: i * 0.1, duration: 0.6, ease: EASE }}
                  whileHover={{ y: -6 }}
                  className="group rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition hover:shadow-md hover:border-amber-200"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 transition group-hover:from-amber-500 group-hover:to-orange-500 group-hover:text-white">
                    <Icon size={24} />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-gray-900">{val.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-600">{val.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Today at Fauward */}
      <section className="bg-white py-20 lg:py-24">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-700">
                <span className="relative z-10">Today at Fauward</span>
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
              <GradientHeading before="Real numbers from" gradient="real operators" />
            </motion.h2>
            <motion.p variants={headerItem} className="mt-3 text-lg text-gray-600">
              Live data from logistics businesses running on the platform right now.
            </motion.p>
          </motion.div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TODAY_STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 24, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
                whileHover={{ y: -4 }}
                className="flex flex-col items-center rounded-2xl border border-gray-200 bg-slate-50 p-7 text-center transition hover:shadow-md hover:border-amber-200"
              >
                <span className={`text-3xl font-bold text-brand-navy ${stat.mono ? "font-mono" : ""}`}>
                  {stat.value}
                </span>
                <span className="mt-2 text-xs leading-snug text-gray-500">{stat.label}</span>
              </motion.div>
            ))}
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {REGION_CARDS.map((r, i) => (
              <motion.div
                key={r.region}
                initial={{ opacity: 0, x: -16, filter: "blur(6px)" }}
                whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: 0.3 + i * 0.12, duration: 0.6, ease: EASE }}
                whileHover={{ y: -3 }}
                className="rounded-xl border border-gray-200 bg-white px-5 py-4 transition hover:border-amber-200 hover:shadow-md"
              >
                <p className="text-lg">{r.icon}</p>
                <p className="mt-1 font-bold text-gray-900">{r.region}</p>
                <p className="mt-1 text-xs text-gray-500">{r.note}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why not generic SaaS — already motion */}
      <CompetitorComparison />
    </>
  );
}
