"use client";

import { motion } from "framer-motion";
import { Zap, Shield, Globe, Users, type LucideIcon } from "lucide-react";

import CompetitorComparison from "@/components/marketing/CompetitorComparison";
import ProblemSection from "@/components/marketing/ProblemSection";
import { TEAM_MEMBERS, COMPANY_VALUES } from "@/lib/marketing-data";

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

const INVESTOR_LOGOS = ["Northline Freight", "Atlas Dispatch", "Relay Fleet", "PortBridge Logistics", "Gulf Link Logistics"];

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

      {/* Problem (already motion) */}
      <ProblemSection />

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

      {/* Team */}
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
                The team
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              <GradientHeading before="Operators, engineers, and" gradient="builders" />
            </motion.h2>
            <motion.p variants={headerItem} className="mt-4 text-lg text-gray-600">
              People who&apos;ve lived the problem we&apos;re solving.
            </motion.p>
          </motion.div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TEAM_MEMBERS.map((member, i) => (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, y: 28, scale: 0.96, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: EASE }}
                whileHover={{ y: -6 }}
                className="group rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm transition hover:border-amber-200 hover:shadow-md"
              >
                <motion.div
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d1f3c] to-[#1a3a6e] text-lg font-bold text-white shadow-lg"
                  whileHover={{ rotate: -4, scale: 1.05 }}
                >
                  {member.initials}
                </motion.div>
                <h3 className="font-bold text-gray-900">{member.name}</h3>
                <p className="mt-0.5 text-xs font-semibold text-amber-600">{member.role}</p>
                <p className="mt-3 text-xs leading-relaxed text-gray-600">{member.bio}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why not generic SaaS — already motion */}
      <CompetitorComparison />

      {/* Investors / backed-by strip */}
      <section className="bg-white py-16">
        <div className="marketing-container text-center">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
            className="mb-6 text-xs font-bold uppercase tracking-widest text-gray-400"
          >
            Trusted by operators across three regions
          </motion.p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {INVESTOR_LOGOS.map((name, i) => (
              <motion.span
                key={name}
                initial={{ opacity: 0, y: 8, scale: 0.92 }}
                whileInView={{ opacity: 0.6, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
                whileHover={{ opacity: 1, scale: 1.05 }}
                className="text-sm font-semibold text-gray-500"
              >
                {name}
              </motion.span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
