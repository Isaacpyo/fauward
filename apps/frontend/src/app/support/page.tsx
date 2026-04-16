"use client";

import Link from "next/link";
import { useState } from "react";
import { Rocket, Package, CreditCard, Code, Smartphone, Settings, Search, Mail, MessageCircle, Phone } from "lucide-react";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import FAQAccordion from "@/components/marketing/FAQAccordion";
import { SUPPORT_CATEGORIES, GENERAL_FAQ_GROUPS } from "@/lib/marketing-data";

const ICON_MAP: Record<string, React.ElementType> = {
  rocket: Rocket,
  package: Package,
  "credit-card": CreditCard,
  code: Code,
  smartphone: Smartphone,
  settings: Settings,
};

const POPULAR_ARTICLES = [
  { title: "How to create your first shipment", href: "/support/getting-started/first-shipment" },
  { title: "Connecting a custom domain for tracking", href: "/support/getting-started/branding" },
  { title: "How proof-of-delivery works offline", href: "/support/drivers/offline" },
  { title: "Setting up webhook events", href: "/support/api/webhooks" },
  { title: "Upgrading or changing your plan", href: "/support/account/billing" },
  { title: "What happens if my driver loses connectivity?", href: "/support/drivers/offline" },
];

export default function SupportPage() {
  const [query, setQuery] = useState("");

  const filteredCategories = query.trim()
    ? SUPPORT_CATEGORIES.filter(
        (cat) =>
          cat.title.toLowerCase().includes(query.toLowerCase()) ||
          cat.articles.some((a) => a.title.toLowerCase().includes(query.toLowerCase()))
      )
    : SUPPORT_CATEGORIES;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0d1f3c] py-16 lg:py-24">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-96 -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
        <div className="marketing-container relative text-center">
          <h1 className="mx-auto max-w-2xl text-4xl font-bold text-white lg:text-5xl">How can we help?</h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-blue-200">
            Search our guides, browse by topic, or reach our support team directly.
          </p>
          {/* Search */}
          <div className="mx-auto mt-8 max-w-xl">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for guides, FAQs, or topics…"
                className="h-14 w-full rounded-xl border border-white/20 bg-white/10 pl-11 pr-5 text-white placeholder-blue-300 text-base outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
          {/* Popular */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-blue-400">Popular:</span>
            {POPULAR_ARTICLES.slice(0, 4).map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="inline-flex rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-blue-200 transition hover:bg-white/10 hover:text-white"
              >
                {a.title}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="bg-white py-16 lg:py-20">
        <div className="marketing-container">
          <h2 className="mb-8 text-2xl font-bold text-gray-900">Browse by topic</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCategories.map((cat) => {
              const Icon = ICON_MAP[cat.icon] ?? Rocket;
              return (
                <div key={cat.slug} className="card-lift rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <Icon size={22} />
                  </div>
                  <h3 className="mb-1 font-bold text-gray-900">{cat.title}</h3>
                  <p className="mb-4 text-xs leading-relaxed text-gray-500">{cat.description}</p>
                  <ul className="space-y-2">
                    {cat.articles.map((article) => (
                      <li key={article.href}>
                        <Link
                          href={article.href}
                          className="flex items-center gap-2 text-sm text-gray-700 underline-animate transition hover:text-amber-600"
                        >
                          <svg className="h-3 w-3 shrink-0 text-amber-400" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M3.75 1.5a.75.75 0 0 0 0 1.5h4.19L2.47 8.47a.75.75 0 0 0 1.06 1.06L9 4.06V8.25a.75.75 0 0 0 1.5 0v-6a.75.75 0 0 0-.75-.75h-6z" />
                          </svg>
                          {article.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FadeInOnScroll>
        <div id="faq">
          <FAQAccordion groups={GENERAL_FAQ_GROUPS} />
        </div>
      </FadeInOnScroll>

      {/* Contact */}
      <FadeInOnScroll>
        <section id="contact" className="bg-gray-50 py-16 lg:py-20">
          <div className="marketing-container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-gray-900">Still need help?</h2>
              <p className="mt-3 text-lg text-gray-600">Our team is available Monday–Friday, 8am–6pm GMT. Enterprise customers get 24/7 dedicated support.</p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {[
                {
                  icon: Mail,
                  title: "Email Support",
                  description: "Send us a message and we'll reply within 4 business hours.",
                  cta: "support@fauward.com",
                  href: "mailto:support@fauward.com",
                  accent: "bg-blue-50 text-blue-600",
                },
                {
                  icon: MessageCircle,
                  title: "Live Chat",
                  description: "Chat with our team in real time from your Fauward dashboard.",
                  cta: "Open chat",
                  href: "/signup",
                  accent: "bg-green-50 text-green-600",
                },
                {
                  icon: Phone,
                  title: "Talk to Sales",
                  description: "Book a 30-minute call to discuss your operation and pricing.",
                  cta: "Book a call",
                  href: "/signup?plan=enterprise",
                  accent: "bg-amber-50 text-amber-600",
                },
              ].map((channel) => (
                <div key={channel.title} className="card-lift rounded-2xl border border-gray-200 bg-white p-7 shadow-sm text-center">
                  <div className={`mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${channel.accent}`}>
                    <channel.icon size={22} />
                  </div>
                  <h3 className="mb-2 font-bold text-gray-900">{channel.title}</h3>
                  <p className="mb-4 text-sm leading-relaxed text-gray-600">{channel.description}</p>
                  <Link
                    href={channel.href}
                    className="inline-flex h-10 items-center rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700"
                  >
                    {channel.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      {/* Docs CTA */}
      <FadeInOnScroll>
        <section className="bg-white py-12">
          <div className="marketing-container flex flex-col items-center justify-between gap-4 rounded-2xl bg-[#0d1f3c] px-8 py-8 sm:flex-row">
            <div>
              <h3 className="text-xl font-bold text-white">Looking for developer docs?</h3>
              <p className="mt-1 text-sm text-blue-200">Full REST API reference, webhook schemas, and integration guides.</p>
            </div>
            <Link
              href="/docs"
              className="shrink-0 inline-flex h-11 items-center rounded-lg border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              View Documentation →
            </Link>
          </div>
        </section>
      </FadeInOnScroll>
    </>
  );
}
