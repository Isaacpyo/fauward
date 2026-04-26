"use client";

import Link from "next/link";
import { useState } from "react";
import BrandLogo from "@/components/marketing/BrandLogo";

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
      { href: "/regions/uk", label: "United Kingdom" },
      { href: "/regions/africa", label: "Africa" },
      { href: "/regions/mena", label: "MENA" },
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
    <footer className="border-t border-gray-200 bg-[#0a1628]">
      {/* Top strip */}
      <div className="border-b border-white/10">
        <div className="marketing-container py-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Launch your logistics platform today.</h3>
              <p className="mt-1 text-sm text-blue-200">14-day free trial · No card required · Live in 10 minutes.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-7 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                Start Free Trial
              </Link>
              <Link
                href="/support#contact"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 px-7 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Talk to Sales
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main footer grid */}
      <div className="marketing-container py-14">
        <div className="grid gap-12 lg:grid-cols-[1.4fr,3fr]">
          {/* Brand column */}
          <div className="space-y-5">
            <div className="w-[44px]">
              <BrandLogo variant="mark" />
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-blue-200">
              Launch a fully branded logistics platform — shipment ops, invoicing, driver app, and customer tracking. No code. No per-seat fees.
            </p>

            <div className="space-y-1.5">
              {[
                { label: "UK", detail: "London, Manchester" },
                { label: "Africa", detail: "Lagos, Nairobi, Accra" },
                { label: "MENA", detail: "Dubai, Riyadh, Cairo" },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-2 text-xs text-blue-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span className="font-medium text-white">{r.label}</span>
                  <span>—</span>
                  <span>{r.detail}</span>
                </div>
              ))}
            </div>

            {/* Newsletter */}
            <form className="space-y-2 pt-2" onSubmit={handleSubscribe}>
              <div>
                <label htmlFor="newsletter-email" className="block text-xs font-semibold uppercase tracking-widest text-blue-300">
                  Newsletter
                </label>
                <p className="mt-0.5 text-xs text-blue-400">Monthly product updates and logistics ops insights. No spam.</p>
              </div>
              {subscribed ? (
                <p className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/40 bg-green-900/30 px-4 py-2.5 text-sm font-semibold text-green-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  You&apos;re on the list ✓
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="newsletter-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder-blue-300 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700"
                  >
                    Subscribe
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Link columns */}
          <div className="grid gap-8 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-blue-300">{column.title}</h3>
                <ul className="space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-blue-200 transition hover:text-amber-400"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs text-blue-400">© {new Date().getFullYear()} Fauward Ltd. All rights reserved.</p>
            <p className="text-xs text-blue-500">
              Fauward Ltd is registered in England &amp; Wales. Company No: [pending]. Registered office: [address]. VAT No: [pending].
            </p>
          </div>
          <div className="flex items-center gap-4">
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-300 transition hover:text-amber-400"
              >
                {link.icon}
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
