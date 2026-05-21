"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  ChevronDown,
} from "lucide-react";

import FinanceWorkflowPanel from "@/components/marketing/FinanceWorkflowPanel";
import type { MarketingFeature } from "@/lib/marketing-data";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const ACCENT: Record<NonNullable<MarketingFeature["accent"]>, { text: string; bg: string; border: string; from: string; to: string }> = {
  amber:  { text: "#b45309", bg: "#fffbeb", border: "#fde68a", from: "#fffbeb", to: "#fef3c7" },
  blue:   { text: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", from: "#eff6ff", to: "#dbeafe" },
  purple: { text: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe", from: "#f5f3ff", to: "#ede9fe" },
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
          animate={{ width: "100%" }}
          transition={{ duration: 1, delay: 0.7, ease: EASE }}
        />
      </span>
      {title.slice(idx + highlight.length)}
    </>
  );
}

function FaqItem({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(i === 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-gray-900">{q}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="shrink-0 text-gray-500"
        >
          <ChevronDown size={18} />
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-4 text-sm leading-relaxed text-gray-600">{a}</p>
      </motion.div>
    </motion.div>
  );
}

export default function FeatureDetailContent({ feature }: { feature: MarketingFeature }) {
  const accent = ACCENT[feature.accent ?? "amber"];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-50 py-16 lg:py-24">
        <div className="absolute inset-0 -z-10 bg-grid opacity-60" aria-hidden />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[500px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="marketing-container relative">
          <Link href="/features" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-navy underline-offset-4 hover:underline">
            <ArrowLeft size={14} /> Back to all features
          </Link>

          <motion.div
            className="mt-8 grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16"
            variants={headerContainer}
            initial="hidden"
            animate="show"
          >
            <div>
              <motion.span
                variants={headerItem}
                className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest"
                style={{ background: accent.bg, borderColor: accent.border, color: accent.text }}
              >
                {feature.eyebrow}
              </motion.span>

              <motion.h1 variants={headerItem} className="mt-5 text-4xl font-bold leading-tight text-gray-900 md:text-5xl">
                {highlightTitle(feature.title, feature.highlightWord)}
              </motion.h1>

              <motion.p variants={headerItem} className="mt-6 text-lg leading-relaxed text-gray-600">
                {feature.pageDescription}
              </motion.p>

              <motion.ul variants={headerItem} className="mt-7 space-y-2.5">
                {feature.bullets.slice(0, 4).map((b, bi) => (
                  <li key={b} className="flex items-start gap-2.5 text-base text-gray-700">
                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: accent.text, color: "#ffffff" }}>
                      <Check size={11} strokeWidth={3} />
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </motion.ul>

              <motion.div variants={headerItem} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <MotionLink
                  href="/signup"
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-amber-500 px-7 text-sm font-semibold text-gray-900 shadow-lg shadow-amber-500/30"
                >
                  Start Free Trial <ArrowRight size={14} />
                </MotionLink>
                <MotionLink
                  href="/pricing"
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 bg-white px-7 text-sm font-semibold text-gray-700"
                >
                  View Pricing
                </MotionLink>
              </motion.div>
            </div>

            <motion.div
              variants={{
                hidden: { opacity: 0, scale: 0.95, filter: "blur(10px)" },
                show:   { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.8, delay: 0.2, ease: EASE } },
              }}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
            >
              <Image src={feature.imageSrc} alt={`${feature.title} screenshot`} width={1020} height={640} className="h-auto w-full" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Metrics */}
      {feature.metrics && feature.metrics.length > 0 ? (
        <section className="border-y border-gray-200 bg-white py-12">
          <div className="marketing-container">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {feature.metrics.map((m, i) => (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
                  className="text-center"
                >
                  <div className="text-4xl font-bold lg:text-5xl" style={{ color: accent.text }}>{m.value}</div>
                  <div className="mt-2 text-sm text-gray-600">{m.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* What this gives your team — cards */}
      <section className="bg-slate-50 py-20 lg:py-24">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gray-600">
                <Sparkles size={12} style={{ color: accent.text }} /> Benefits
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold text-gray-900 md:text-4xl">
              What this gives your team
            </motion.h2>
          </motion.div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {feature.cards.map((card, i) => (
              <motion.article
                key={card.title}
                initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: EASE }}
                whileHover={{ y: -6 }}
                className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: accent.bg, color: accent.text }}>
                  <Check size={16} strokeWidth={3} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
                <p className="mt-3 text-base text-gray-600">{card.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow timeline */}
      {feature.workflow && feature.workflow.length > 0 ? (
        <section className="bg-white py-20 lg:py-24">
          <div className="marketing-container">
            <motion.div
              className="mx-auto max-w-2xl text-center"
              variants={headerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.3 }}
            >
              <motion.div variants={headerItem} className="mb-4 inline-block">
                <span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest"
                  style={{ background: accent.bg, borderColor: accent.border, color: accent.text }}
                >
                  How it works
                </span>
              </motion.div>
              <motion.h2 variants={headerItem} className="text-3xl font-bold text-gray-900 md:text-4xl">
                The full lifecycle, end-to-end
              </motion.h2>
            </motion.div>

            <div className="mx-auto mt-14 max-w-3xl">
              <div className="relative space-y-4">
                <div className="absolute left-6 top-2 bottom-2 w-px" style={{ background: `linear-gradient(to bottom, transparent, ${accent.text}40, transparent)` }} aria-hidden />
                {feature.workflow.map((step, i) => (
                  <motion.div
                    key={step.step}
                    initial={{ opacity: 0, x: -24, filter: "blur(8px)" }}
                    whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ delay: i * 0.12, duration: 0.6, ease: EASE }}
                    className="relative flex items-start gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                  >
                    <div
                      className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold"
                      style={{ background: accent.bg, color: accent.text, borderColor: accent.border, borderWidth: 1 }}
                    >
                      {step.step}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-gray-600">{step.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Use cases by persona */}
      {feature.useCases && feature.useCases.length > 0 ? (
        <section className="bg-slate-50 py-20 lg:py-24">
          <div className="marketing-container">
            <motion.div
              className="mx-auto max-w-2xl text-center"
              variants={headerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.3 }}
            >
              <motion.h2 variants={headerItem} className="text-3xl font-bold text-gray-900 md:text-4xl">
                Who it&apos;s for
              </motion.h2>
              <motion.p variants={headerItem} className="mt-3 text-lg text-gray-600">
                Built for every team that touches a shipment.
              </motion.p>
            </motion.div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {feature.useCases.map((u, i) => (
                <motion.div
                  key={u.persona}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: i * 0.1, duration: 0.6, ease: EASE }}
                  className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <div className="text-xs font-bold uppercase tracking-widest" style={{ color: accent.text }}>{u.persona}</div>
                  <p className="mt-3 text-base leading-relaxed text-gray-700">{u.benefit}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Integrations strip */}
      {feature.integrations && feature.integrations.length > 0 ? (
        <section className="bg-white py-14">
          <div className="marketing-container">
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5 }}
              className="text-center text-xs font-bold uppercase tracking-widest text-gray-400"
            >
              Plays well with
            </motion.p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {feature.integrations.map((name, i) => (
                <motion.span
                  key={name}
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: i * 0.04, duration: 0.4, ease: EASE }}
                  className="inline-flex rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 shadow-sm"
                >
                  {name}
                </motion.span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* FAQ */}
      {feature.faqs && feature.faqs.length > 0 ? (
        <section className="bg-slate-50 py-20 lg:py-24">
          <div className="marketing-container">
            <div className="mx-auto max-w-3xl">
              <motion.div
                className="mb-10 text-center"
                variants={headerContainer}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.4 }}
              >
                <motion.h2 variants={headerItem} className="text-3xl font-bold text-gray-900 md:text-4xl">
                  Frequently asked
                </motion.h2>
                <motion.p variants={headerItem} className="mt-3 text-base text-gray-600">
                  Quick answers about {feature.eyebrow.toLowerCase()}.
                </motion.p>
              </motion.div>
              <div className="space-y-3">
                {feature.faqs.map((f, i) => (
                  <FaqItem key={f.question} q={f.question} a={f.answer} i={i} />
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {feature.slug === "finance" && <FinanceWorkflowPanel />}
    </>
  );
}
