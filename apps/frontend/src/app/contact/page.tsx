import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import StructuredData from "@/components/seo/StructuredData";
import { buildBreadcrumbSchema } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Contact Us",
    description: "Get in touch with Fauward — sales, support, partnerships, and press enquiries.",
    path: "/contact",
  });
}

const channels = [
  {
    category: "Sales",
    description: "Discuss your logistics operation, pricing, and how Fauward fits your needs.",
    email: "sales@fauward.com",
    cta: "Book a call",
    href: "mailto:sales@fauward.com",
    color: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-700",
  },
  {
    category: "Support",
    description: "Technical help, account issues, and platform questions for existing customers.",
    email: "support@fauward.com",
    cta: "Email support",
    href: "mailto:support@fauward.com",
    color: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-700",
  },
  {
    category: "Partnerships",
    description: "Integration partnerships, reseller agreements, and white-label enquiries.",
    email: "partners@fauward.com",
    cta: "Get in touch",
    href: "mailto:partners@fauward.com",
    color: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-700",
  },
  {
    category: "Press & Media",
    description: "Press releases, media kits, interview requests, and analyst enquiries.",
    email: "press@fauward.com",
    cta: "Contact press",
    href: "mailto:press@fauward.com",
    color: "bg-purple-50 border-purple-200",
    badge: "bg-purple-100 text-purple-700",
  },
  {
    category: "Legal & Privacy",
    description: "GDPR requests, data subject rights, and legal correspondence.",
    email: "privacy@fauward.com",
    cta: "Send request",
    href: "mailto:privacy@fauward.com",
    color: "bg-gray-50 border-gray-200",
    badge: "bg-gray-100 text-gray-700",
  },
];

const offices = [
  { region: "United Kingdom", detail: "London & Manchester", flag: "🇬🇧" },
  { region: "West Africa", detail: "Lagos, Accra", flag: "🌍" },
  { region: "East Africa", detail: "Nairobi", flag: "🌍" },
  { region: "MENA", detail: "Dubai, Riyadh, Cairo", flag: "🌐" },
];

export default function ContactPage() {
  return (
    <>
      <StructuredData data={[buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }])]} />

      {/* Hero */}
      <section className="bg-[#0d1f3c] py-20 lg:py-28">
        <div className="marketing-container text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-400">
            Get in touch
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            We&apos;d love to hear from you
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-blue-200">
            Whether you&apos;re evaluating Fauward for your logistics operation or you&apos;re an existing customer, we&apos;ll get back to you fast.
          </p>
        </div>
      </section>

      {/* Channels */}
      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((ch) => (
              <div key={ch.category} className={`card-lift rounded-2xl border p-7 ${ch.color}`}>
                <span className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ch.badge}`}>
                  {ch.category}
                </span>
                <p className="mt-2 text-sm leading-relaxed text-gray-700">{ch.description}</p>
                <p className="mt-3 text-sm font-medium text-gray-900">{ch.email}</p>
                <a
                  href={ch.href}
                  className="mt-4 inline-flex h-9 items-center rounded-lg bg-white border border-gray-200 px-5 text-xs font-semibold text-gray-900 transition hover:bg-gray-50 shadow-sm"
                >
                  {ch.cta} →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Offices */}
      <section className="bg-gray-50 py-16">
        <div className="marketing-container">
          <h2 className="text-2xl font-bold text-gray-900">Where we operate</h2>
          <p className="mt-2 text-sm text-gray-600">Fauward is a UK-registered company serving logistics businesses across four regions.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {offices.map((o) => (
              <div key={o.region} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-2xl">{o.flag}</p>
                <p className="mt-2 font-semibold text-gray-900">{o.region}</p>
                <p className="text-sm text-gray-500">{o.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-gray-500">
            Fauward Ltd is registered in England &amp; Wales. Registered office address available on request.
          </p>
        </div>
      </section>

      {/* Response time */}
      <section className="bg-white py-16">
        <div className="marketing-container max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-gray-900">Response times</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Sales enquiries", time: "Within 4 hours", sub: "Mon–Fri, 9am–6pm GMT" },
              { label: "Support tickets", time: "Within 2 hours", sub: "Enterprise SLA; Pro best-effort" },
              { label: "General enquiries", time: "Within 1 business day", sub: "All time zones" },
            ].map((r) => (
              <div key={r.label} className="rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{r.label}</p>
                <p className="mt-2 text-lg font-bold text-gray-900">{r.time}</p>
                <p className="mt-1 text-xs text-gray-500">{r.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
