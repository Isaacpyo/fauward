"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Rocket,
  Package,
  CreditCard,
  Code,
  Smartphone,
  Settings,
  Search,
  Mail,
  MessageCircle,
  Phone,
  ArrowRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import FAQAccordion from "@/components/marketing/FAQAccordion";
import { SUPPORT_CATEGORIES, GENERAL_FAQ_GROUPS } from "@/lib/marketing-data";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const ICON_MAP: Record<string, LucideIcon> = {
  rocket: Rocket,
  package: Package,
  "credit-card": CreditCard,
  code: Code,
  smartphone: Smartphone,
  settings: Settings,
};

const POPULAR_ARTICLES = [
  { title: "How to create your first shipment",                  href: "/support/getting-started/first-shipment" },
  { title: "Connecting a custom domain for tracking",            href: "/support/getting-started/branding" },
  { title: "How proof-of-delivery works offline",                href: "/support/drivers/offline" },
  { title: "Setting up webhook events",                          href: "/support/api/webhooks" },
  { title: "Upgrading or changing your plan",                    href: "/support/account/billing" },
  { title: "What happens if my driver loses connectivity?",      href: "/support/drivers/offline" },
];

const headerContainer = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};
const headerItem = {
  hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.65, ease: EASE } },
};

function openLiveChat() {
  window.dispatchEvent(new CustomEvent("fauward:open-relay-chat"));
}

export default function SupportPageContent() {
  const [query, setQuery] = useState("");

  const filteredCategories = query.trim()
    ? SUPPORT_CATEGORIES.filter(
        (cat) =>
          cat.title.toLowerCase().includes(query.toLowerCase()) ||
          cat.articles.some((a) => a.title.toLowerCase().includes(query.toLowerCase())),
      )
    : SUPPORT_CATEGORIES;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-amber-500/15 blur-3xl"
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"
          animate={{ opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />

        <div className="marketing-container relative">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-300">
                <Sparkles size={12} />
                <span className="relative z-10">Help Centre</span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                  style={{ background: "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%, transparent 100%)" }}
                />
              </span>
            </motion.div>

            <motion.h1 variants={headerItem} className="mx-auto text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
              How can we{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 bg-clip-text text-transparent">
                  help?
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, delay: 0.7, ease: EASE }}
                />
              </span>
            </motion.h1>

            <motion.p variants={headerItem} className="mx-auto mt-5 max-w-lg text-lg text-blue-200/90">
              Search our guides, browse by topic, or reach our support team directly.
            </motion.p>

            <motion.div variants={headerItem} className="mx-auto mt-8 max-w-xl">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-300" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for guides, FAQs, or topics…"
                  className="h-14 w-full rounded-2xl border border-white/15 bg-white/10 pl-11 pr-5 text-base text-white placeholder-blue-300 outline-none backdrop-blur-sm transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
            </motion.div>

            <motion.div variants={headerItem} className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-blue-400">Popular:</span>
              {POPULAR_ARTICLES.slice(0, 4).map((a, i) => (
                <MotionLink
                  key={a.href}
                  href={a.href}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.4, ease: EASE }}
                  whileHover={{ y: -2 }}
                  className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-blue-100 transition hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
                >
                  {a.title}
                </MotionLink>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Browse by topic */}
      <section className="bg-slate-50 py-16 lg:py-20">
        <div className="marketing-container">
          <motion.div
            className="mb-10 max-w-2xl"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-3 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-700">
                Topics
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              Browse by{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                  topic
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
                  initial={{ width: 0 }}
                  whileInView={{ width: "100%" }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 1, delay: 0.4, ease: EASE }}
                />
              </span>
            </motion.h2>
          </motion.div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCategories.map((cat, i) => {
              const Icon = ICON_MAP[cat.icon] ?? Rocket;
              return (
                <motion.div
                  key={cat.slug}
                  initial={{ opacity: 0, y: 24, scale: 0.97, filter: "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ delay: i * 0.08, duration: 0.55, ease: EASE }}
                  whileHover={{ y: -4 }}
                  className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-amber-200 hover:shadow-md"
                >
                  <motion.div
                    whileHover={{ rotate: -4, scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 320, damping: 20 }}
                    className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 shadow-sm"
                  >
                    <Icon size={22} />
                  </motion.div>
                  <h3 className="mb-1 font-bold text-gray-900">{cat.title}</h3>
                  <p className="mb-4 text-xs leading-relaxed text-gray-500">{cat.description}</p>
                  <ul className="space-y-2">
                    {cat.articles.map((article) => (
                      <li key={article.href}>
                        <Link
                          href={article.href}
                          className="group/link relative inline-flex items-center gap-1.5 text-sm text-gray-700 transition hover:text-amber-700"
                        >
                          <span className="absolute -left-2 inline-block h-px w-0 bg-amber-400 transition-all duration-300 group-hover/link:w-1.5" aria-hidden />
                          <span className="transition-transform duration-300 group-hover/link:translate-x-1">{article.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <div id="faq">
        <FAQAccordion groups={GENERAL_FAQ_GROUPS} />
      </div>

      {/* Contact channels */}
      <section id="contact" className="bg-slate-50 py-16 lg:py-20">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-3 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-700">
                Talk to us
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              Still need{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                  help?
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
                  initial={{ width: 0 }}
                  whileInView={{ width: "100%" }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 1, delay: 0.4, ease: EASE }}
                />
              </span>
            </motion.h2>
            <motion.p variants={headerItem} className="mt-3 text-lg text-gray-600">
              Our team is available Monday–Friday, 8am–6pm GMT. Enterprise customers get 24/7 dedicated support.
            </motion.p>
          </motion.div>

          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: Mail,
                title: "Email Support",
                description: "Send us a message and we'll reply within 4 business hours.",
                cta: "support@fauward.com",
                href: "mailto:support@fauward.com",
                accent: { bg: "#eff6ff", text: "#1d4ed8" },
              },
              {
                icon: MessageCircle,
                title: "Live Chat",
                description: "Chat with our team in real time from your Fauward dashboard.",
                cta: "Open chat",
                href: "#open-chat",
                accent: { bg: "#ecfdf5", text: "#047857" },
              },
              {
                icon: Phone,
                title: "Talk to Sales",
                description: "Book a 30-minute call to discuss your operation and pricing.",
                cta: "Book a call",
                href: "/support#contact",
                accent: { bg: "#fffbeb", text: "#b45309" },
              },
            ].map((channel, i) => (
              <motion.div
                key={channel.title}
                initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: i * 0.12, duration: 0.6, ease: EASE }}
                whileHover={{ y: -6 }}
                className="group rounded-2xl border border-gray-200 bg-white p-7 text-center shadow-sm transition hover:border-amber-200 hover:shadow-md"
              >
                <motion.div
                  whileHover={{ rotate: -4, scale: 1.06 }}
                  transition={{ type: "spring", stiffness: 320, damping: 20 }}
                  className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl shadow-sm"
                  style={{ background: channel.accent.bg, color: channel.accent.text }}
                >
                  <channel.icon size={22} />
                </motion.div>
                <h3 className="mb-2 font-bold text-gray-900">{channel.title}</h3>
                <p className="mb-5 text-sm leading-relaxed text-gray-600">{channel.description}</p>
                {channel.href === "#open-chat" ? (
                  <motion.button
                    type="button"
                    onClick={openLiveChat}
                    whileHover={{ y: -1, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="group/btn relative inline-flex h-11 items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-amber-500 px-6 text-sm font-semibold text-gray-900 shadow shadow-amber-500/30"
                  >
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      {channel.cta}
                      <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-0.5" />
                    </span>
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 -z-0"
                      initial={{ x: "-100%" }}
                      whileHover={{ x: "100%" }}
                      transition={{ duration: 0.6, ease: EASE }}
                      style={{ background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)" }}
                    />
                  </motion.button>
                ) : (
                  <MotionLink
                    href={channel.href}
                    whileHover={{ y: -1, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="group/btn relative inline-flex h-11 items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-amber-500 px-6 text-sm font-semibold text-gray-900 shadow shadow-amber-500/30"
                  >
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      {channel.cta}
                      <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-0.5" />
                    </span>
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 -z-0"
                      initial={{ x: "-100%" }}
                      whileHover={{ x: "100%" }}
                      transition={{ duration: 0.6, ease: EASE }}
                      style={{ background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)" }}
                    />
                  </MotionLink>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Developer docs strip */}
      <section className="bg-white py-12">
        <div className="marketing-container">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="relative mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d1f3c] to-[#1a3a6e] px-8 py-8 shadow-xl sm:flex-row"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/30 blur-3xl"
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative">
              <h3 className="text-xl font-bold text-white">Looking for developer docs?</h3>
              <p className="mt-1 text-sm text-blue-200">Full REST API reference, webhook schemas, and integration guides.</p>
            </div>
            <MotionLink
              href="/docs"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="group relative inline-flex h-11 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-white/20 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm"
            >
              <span className="relative z-10 inline-flex items-center gap-1.5">
                View Documentation
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ y: "100%" }}
                whileHover={{ y: "0%" }}
                transition={{ duration: 0.4, ease: EASE }}
                style={{ background: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)" }}
              />
            </MotionLink>
          </motion.div>
        </div>
      </section>
    </>
  );
}
