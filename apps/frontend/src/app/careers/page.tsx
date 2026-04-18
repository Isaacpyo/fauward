import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import StructuredData from "@/components/seo/StructuredData";
import { buildBreadcrumbSchema } from "@/lib/seo";
import Link from "next/link";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Careers",
    description: "Join the Fauward team — building logistics infrastructure for the next generation of freight operators.",
    path: "/careers",
  });
}

const values = [
  {
    title: "Ship fast, learn faster",
    description: "We move quickly and treat every deploy as a learning opportunity. Speed is a habit, not a pressure.",
  },
  {
    title: "Customer obsession",
    description: "We start with the logistics operator's problem — what slows them down, what costs them money, what they need to grow.",
  },
  {
    title: "Ownership without ego",
    description: "Every person owns a part of the product end-to-end. We give feedback directly and take it well.",
  },
  {
    title: "Global by default",
    description: "Our team spans multiple time zones and our product serves four regions. Diversity of perspective is a feature.",
  },
];

const openRoles: { title: string; team: string; location: string; type: string }[] = [];

export default function CareersPage() {
  return (
    <>
      <StructuredData data={[buildBreadcrumbSchema([{ name: "Home", href: "/" }, { name: "Careers", href: "/careers" }])]} />

      {/* Hero */}
      <section className="bg-[#0d1f3c] py-20 lg:py-28">
        <div className="marketing-container text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-400">
            We&apos;re hiring
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            Build the logistics layer<br className="hidden md:block" /> for the next decade
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-blue-200">
            Fauward is a small, ambitious team building multi-tenant logistics software for operators across the UK, Africa, and MENA. We&apos;re looking for people who care deeply about their craft and want to work on hard problems.
          </p>
          <a
            href="mailto:careers@fauward.com"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-amber-600 px-8 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            Send us your CV
          </a>
        </div>
      </section>

      {/* Values */}
      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container">
          <h2 className="text-2xl font-bold text-gray-900">How we work</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {values.map((v) => (
              <div key={v.title} className="rounded-xl border border-gray-200 bg-gray-50 p-7">
                <h3 className="font-bold text-gray-900">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className="bg-gray-50 py-16">
        <div className="marketing-container">
          <h2 className="text-2xl font-bold text-gray-900">What we offer</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "🌍", title: "Remote-first", detail: "Work from anywhere in your region. We hire across UK, Africa, and MENA." },
              { icon: "📈", title: "Equity", detail: "Options for every full-time hire. We want you to own a piece of what you build." },
              { icon: "🏥", title: "Private health cover", detail: "UK team: BUPA private health. Global team: equivalent local coverage." },
              { icon: "📚", title: "Learning budget", detail: "£1,000/year for courses, conferences, and books. No approval needed under £200." },
              { icon: "🛫", title: "Team offsites", detail: "Twice-yearly in-person meetups. We've been to Lagos, London, and Dubai." },
              { icon: "⚡", title: "Latest tools", detail: "MacBook Pro, Notion, Linear, Figma, and any dev tools that make you faster." },
            ].map((p) => (
              <div key={p.title} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <p className="text-2xl">{p.icon}</p>
                <p className="mt-2 font-semibold text-gray-900">{p.title}</p>
                <p className="mt-1 text-sm text-gray-600">{p.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open roles */}
      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container">
          <h2 className="text-2xl font-bold text-gray-900">Open roles</h2>
          {openRoles.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
              <p className="text-2xl">📭</p>
              <p className="mt-3 font-semibold text-gray-900">No roles listed right now</p>
              <p className="mt-1 text-sm text-gray-600">
                We hire proactively for exceptional candidates. If you&apos;re brilliant at what you do,{" "}
                <a href="mailto:careers@fauward.com" className="text-amber-700 underline">drop us a note</a>.
              </p>
            </div>
          ) : (
            <div className="mt-8 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
              {openRoles.map((role) => (
                <div key={role.title} className="flex items-center justify-between gap-4 px-6 py-5">
                  <div>
                    <p className="font-semibold text-gray-900">{role.title}</p>
                    <p className="mt-0.5 text-sm text-gray-500">{role.team} · {role.location} · {role.type}</p>
                  </div>
                  <a href="mailto:careers@fauward.com" className="shrink-0 rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">
                    Apply →
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0d1f3c] py-16">
        <div className="marketing-container max-w-xl text-center">
          <h2 className="text-2xl font-bold text-white">Not seeing the right role?</h2>
          <p className="mt-3 text-sm text-blue-200">
            We review speculative applications. Tell us what you&apos;re great at and how you&apos;d contribute to Fauward.
          </p>
          <a
            href="mailto:careers@fauward.com"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-8 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            careers@fauward.com
          </a>
          <p className="mt-4 text-xs text-blue-400">We respond to every application within 5 business days.</p>
        </div>
      </section>
    </>
  );
}
