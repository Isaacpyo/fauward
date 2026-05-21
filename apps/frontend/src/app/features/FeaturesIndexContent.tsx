"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { MARKETING_FEATURES, type MarketingFeature } from "@/lib/marketing-data";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const ACCENT: Record<NonNullable<MarketingFeature["accent"]>, { from: string; to: string; text: string; pillBg: string; pillBorder: string }> = {
  amber:  { from: "#fffbeb", to: "#fef3c7", text: "#b45309", pillBg: "#fffbeb", pillBorder: "#fde68a" },
  blue:   { from: "#eff6ff", to: "#dbeafe", text: "#1d4ed8", pillBg: "#eff6ff", pillBorder: "#bfdbfe" },
  purple: { from: "#f5f3ff", to: "#ede9fe", text: "#6d28d9", pillBg: "#f5f3ff", pillBorder: "#ddd6fe" },
};

const headerContainer = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};
const headerItem = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

function highlightTitle(title: string, highlight?: string) {
  if (!highlight) return title;
  const idx = title.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return title;
  return (
    <>
      {title.slice(0, idx)}
      <span className="relative inline-block">
        <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
          {title.slice(idx, idx + highlight.length)}
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
      {title.slice(idx + highlight.length)}
    </>
  );
}

function FeatureRow({ feature, index }: { feature: MarketingFeature; index: number }) {
  const reverse = index % 2 === 1;
  const accent = ACCENT[feature.accent ?? "amber"];

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}
    >
      {/* Text */}
      <motion.div
        variants={{
          hidden: { opacity: 0, x: reverse ? 40 : -40, filter: "blur(10px)" },
          show:   { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE } },
        }}
      >
        <span
          className="mb-5 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest"
          style={{ background: accent.pillBg, borderColor: accent.pillBorder, color: accent.text }}
        >
          {feature.eyebrow}
        </span>

        <h2 className="text-3xl font-bold leading-tight text-gray-900 lg:text-4xl">
          {highlightTitle(feature.title, feature.highlightWord)}
        </h2>

        <p className="mt-5 text-lg leading-relaxed text-gray-600">{feature.pageDescription}</p>

        {feature.metrics && feature.metrics.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {feature.metrics.map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.5, ease: EASE }}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              >
                <div className="text-lg font-bold" style={{ color: accent.text }}>{m.value}</div>
                <div className="text-[11px] leading-tight text-gray-500">{m.label}</div>
              </motion.div>
            ))}
          </div>
        ) : null}

        <ul className="mt-7 space-y-2.5">
          {feature.bullets.slice(0, 4).map((b, bi) => (
            <motion.li
              key={b}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 + bi * 0.07, duration: 0.5, ease: EASE }}
              className="flex items-start gap-2.5 text-base text-gray-700"
            >
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: accent.text, color: "#ffffff" }}>
                <Check size={11} strokeWidth={3} />
              </span>
              {b}
            </motion.li>
          ))}
        </ul>

        <MotionLink
          href={`/features/${feature.slug}`}
          initial="rest"
          animate="rest"
          whileHover="hover"
          className="relative mt-8 inline-flex h-12 items-center gap-2 overflow-hidden rounded-lg border px-7 text-sm font-semibold shadow-sm"
          variants={{
            rest:  { borderColor: "#d1d5db", color: "#111827" },
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
            Explore {feature.eyebrow}
            <motion.span variants={{ rest: { x: 0 }, hover: { x: 4 } }} transition={{ duration: 0.3 }}>
              <ArrowRight size={16} />
            </motion.span>
          </span>
        </MotionLink>
      </motion.div>

      {/* Visual */}
      <motion.div
        variants={{
          hidden: { opacity: 0, x: reverse ? -40 : 40, scale: 0.95, filter: "blur(10px)" },
          show:   { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.8, delay: 0.15, ease: EASE } },
        }}
        className="relative"
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-8 -z-10 rounded-3xl blur-3xl"
          style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
          animate={{ opacity: [0.55, 0.85, 0.55] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          <Image
            src={feature.imageSrc}
            alt={`${feature.title} screenshot`}
            width={1020}
            height={640}
            className="h-auto w-full"
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function FeaturesIndexContent() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-50 py-20 lg:py-28">
        <div className="absolute inset-0 -z-10 bg-grid opacity-60" aria-hidden />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[500px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(ellipse, #bfdbfe 0%, #e0e7ff 60%, transparent 100%)" }}
          animate={{ opacity: [0.35, 0.55, 0.35] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="marketing-container relative">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            variants={headerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                <Sparkles size={12} className="text-amber-500" />
                <span className="relative z-10">Features</span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
                  style={{ background: "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.85) 50%, transparent 65%, transparent 100%)" }}
                />
              </span>
            </motion.div>

            <motion.h1 variants={headerItem} className="text-4xl font-bold leading-tight text-gray-900 md:text-5xl lg:text-6xl">
              Features for{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                  modern logistics teams
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, delay: 0.6, ease: EASE }}
                />
              </span>
            </motion.h1>

            <motion.p variants={headerItem} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
              From shipment execution to finance controls — Fauward gives operators and customers one consistent platform with no add-ons, no surprises, no per-seat charges.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Feature rows */}
      <section className="bg-white py-20 lg:py-28">
        <div className="marketing-container">
          <div className="space-y-24 lg:space-y-32">
            {MARKETING_FEATURES.map((feature, i) => (
              <FeatureRow key={feature.slug} feature={feature} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-slate-50 py-16">
        <div className="marketing-container">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl bg-gradient-to-br from-[#0d1f3c] to-[#1a3a6e] px-8 py-10 text-center shadow-xl"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-400/30 blur-3xl"
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <h3 className="text-2xl font-bold text-white lg:text-3xl">See every feature in action</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-blue-200">
              Start a free trial to test workflows, invite your team, and validate your process end-to-end.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <MotionLink
                href="/signup"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-11 items-center rounded-lg bg-amber-500 px-7 text-sm font-semibold text-gray-900 shadow-lg shadow-amber-500/30"
              >
                Start Free Trial
              </MotionLink>
              <MotionLink
                href="/pricing"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-11 items-center rounded-lg border border-white/20 px-7 text-sm font-semibold text-white hover:bg-white/10"
              >
                View Pricing
              </MotionLink>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
