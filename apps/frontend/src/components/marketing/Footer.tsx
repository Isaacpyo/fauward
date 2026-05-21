"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import BrandLogo from "@/components/marketing/BrandLogo";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE } },
};

const footerColumns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/agent", label: "AI Agent" },
      { href: "/features/shipment-management", label: "Shipment Ops" },
      { href: "/features/finance", label: "Finance & Invoicing" },
      { href: "/features/white-label", label: "White-label" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/services", label: "Our Services" },
      { href: "/services#courier-startups", label: "Courier Startups" },
      { href: "/services#freight-operators", label: "Freight Operators" },
      { href: "/services#3pl-providers", label: "3PL Providers" },
      { href: "/services#enterprise-fleets", label: "Enterprise Fleets" },
    ],
  },
  {
    title: "Regions",
    links: [
      { href: "/regions/uk", label: "UK & Europe" },
      { href: "/regions/africa", label: "Africa" },
      { href: "/regions/asia", label: "Asia" },
      { href: "/regions/global", label: "Global" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/news", label: "News & Updates" },
      { href: "/careers", label: "Careers" },
      { href: "/trust", label: "Trust & Security" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/support", label: "Help Centre" },
      { href: "/support#contact", label: "Contact Support" },
      { href: "/support#faq", label: "FAQs" },
      { href: "/docs", label: "Documentation" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/cookies", label: "Cookie Policy" },
    ],
  },
];

const socialLinks = [
  {
    href: "https://www.linkedin.com/company/fauward",
    label: "LinkedIn",
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    href: "https://x.com/fauward",
    label: "X",
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    href: "https://www.youtube.com/@fauward",
    label: "YouTube",
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
];

export default function Footer() {
  const [subscribed, setSubscribed] = useState(false);

  function handleSubscribe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubscribed(true);
  }

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#0a1628]">
      {/* Subtle gradient + glow accents */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl"
        animate={{ opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <motion.div
        className="marketing-container relative py-14 lg:py-16"
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
      >
        <div className="grid gap-12 lg:grid-cols-[1.4fr,3fr]">
          {/* Brand column */}
          <motion.div variants={item} className="space-y-5">
            <motion.div whileHover={{ scale: 1.04, rotate: -2 }} transition={{ type: "spring", stiffness: 320, damping: 20 }} className="w-[44px]">
              <BrandLogo variant="mark" />
            </motion.div>

            <p className="max-w-sm text-sm leading-relaxed text-blue-200/90">
              Launch a fully branded logistics platform — shipment ops, invoicing, driver app, and customer tracking. No code. No per-seat fees.
            </p>

            <div className="space-y-1.5">
              {[
                { label: "UK & Europe", detail: "London, Manchester, Amsterdam" },
                { label: "Africa",      detail: "Lagos, Nairobi, Accra" },
                { label: "Asia",        detail: "Dubai, Riyadh, Singapore" },
              ].map((r, i) => (
                <motion.div
                  key={r.label}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.4, ease: EASE }}
                  className="flex items-center gap-2 text-xs text-blue-300"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
                  <span className="font-medium text-white">{r.label}</span>
                  <span className="text-blue-500">—</span>
                  <span>{r.detail}</span>
                </motion.div>
              ))}
            </div>

            {/* Newsletter */}
            <motion.form
              variants={item}
              className="space-y-2.5 pt-3"
              onSubmit={handleSubscribe}
            >
              <div>
                <label htmlFor="newsletter-email" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                  <Sparkles size={11} /> Newsletter
                </label>
                <p className="mt-0.5 text-xs text-blue-400">Monthly product updates and logistics ops insights. No spam.</p>
              </div>
              {subscribed ? (
                <motion.p
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/40 bg-green-900/30 px-4 py-2.5 text-sm font-semibold text-green-300"
                >
                  <Check size={14} strokeWidth={3} />
                  You&apos;re on the list
                </motion.p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="newsletter-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="h-11 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder-blue-300/70 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  />
                  <motion.button
                    type="submit"
                    whileHover={{ y: -1, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 380, damping: 22 }}
                    className="group relative inline-flex h-11 items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-amber-500 px-5 text-sm font-semibold text-gray-900 shadow-lg shadow-amber-500/30"
                  >
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      Subscribe
                      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
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
                </div>
              )}
            </motion.form>
          </motion.div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
            {footerColumns.map((column) => (
              <motion.div key={column.title} variants={item}>
                <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">{column.title}</h3>
                <ul className="space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="group relative inline-flex items-center gap-1.5 text-sm text-blue-200/85 transition hover:text-white"
                      >
                        <span className="absolute -left-3 inline-block h-px w-0 bg-amber-400 transition-all duration-300 group-hover:w-2" aria-hidden />
                        <span className="transition-transform duration-300 group-hover:translate-x-1">{link.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <motion.div
          variants={item}
          className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-1">
            <p className="text-xs text-blue-400">© {new Date().getFullYear()} Fauward Ltd. All rights reserved.</p>
            <p className="text-xs text-blue-500">
              Fauward Ltd is registered in England &amp; Wales. Company No: [pending]. Registered office: [address]. VAT No: [pending].
            </p>
          </div>
          <div className="flex items-center gap-2">
            {socialLinks.map((link, i) => (
              <motion.a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.4, ease: EASE }}
                whileHover={{ y: -2, scale: 1.05 }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-blue-300 transition hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400"
                aria-label={link.label}
              >
                {link.icon}
              </motion.a>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </footer>
  );
}
