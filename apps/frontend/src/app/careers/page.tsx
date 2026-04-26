import type { Metadata } from "next";
import Link from "next/link";

import StructuredData from "@/components/seo/StructuredData";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";
import { sampleRoles } from "@/components/careers/careers-data";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Careers",
    description: "Join Fauward and build logistics software for global supply chains.",
    path: "/careers",
  });
}

const benefits = [
  {
    label: "Competitive Equity",
    description: "Every full-time hire shares in the value created by the platform.",
    icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />,
  },
  {
    label: "Full Remote",
    description: "Work from where you do your best operating rhythm across compatible time zones.",
    icon: <><path d="M3 5h18v11H3z" /><path d="M8 21h8M12 16v5" /></>,
  },
  {
    label: "Health & Dental",
    description: "Private cover for core markets with equivalent local support elsewhere.",
    icon: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />,
  },
  {
    label: "Relocation Support",
    description: "Structured support for moves that help teams work close to customers.",
    icon: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  },
  {
    label: "Learning Budget",
    description: "Annual budget for courses, books, conferences, and role-specific tools.",
    icon: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" /></>,
  },
  {
    label: "Flexible Hours",
    description: "Plan your day around deep work, customer windows, and reliable handoffs.",
    icon: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  },
];

export default function CareersPage() {
  const featuredRoles = sampleRoles.slice(0, 3);

  return (
    <>
      <StructuredData data={[buildBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Careers", path: "/careers" }])]} />

      <section className="bg-[#0d1f3c] py-20 text-white lg:py-28">
        <div className="marketing-container">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-amber-400">Careers at Fauward</p>
          <h1 className="max-w-5xl text-5xl font-extrabold leading-[0.98] tracking-tight md:text-7xl">
            Move the world&apos;s goods. Build what moves them.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-200">
            Fauward builds logistics software for operators moving freight across regions, modes, and customer expectations.
            <br />
            Join the team turning real-world supply chain pressure into fast, reliable product systems.
          </p>
          <Link
            href="/careers/open-roles"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-7 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            View open roles -&gt;
          </Link>

          <div className="mt-16 grid gap-6 border-t border-white/15 pt-6 sm:grid-cols-3">
            {[
              ["50+", "Team members"],
              ["18", "Countries served"],
              ["6", "Open roles"],
            ].map(([value, label], index) => (
              <div key={label} className={index > 0 ? "sm:border-l sm:border-white/15 sm:pl-6" : ""}>
                <p className="text-2xl font-extrabold text-white">{value}</p>
                <p className="mt-1 text-sm text-blue-200">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container grid gap-10 md:grid-cols-[0.65fr,1.35fr]">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Why Fauward</p>
          <div>
            <h2 className="max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-gray-900 md:text-5xl">
              Operational software with consequences beyond the screen.
            </h2>
            <div className="mt-6 max-w-3xl space-y-4 text-base leading-7 text-gray-600">
              <p>
                Logistics SaaS sits directly inside the movement of inventory, drivers, depots, invoices, and customers.
                When Fauward gets faster or clearer, operators recover time, reduce missed handoffs, and give their own customers more confidence.
              </p>
              <p>
                That makes the work unusually concrete. We ship with speed because supply chains do not pause, and we design systems that can handle the realities of global operations: imperfect data, regional complexity, and teams that need answers now.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16 lg:py-24">
        <div className="marketing-container">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Open Roles</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">Featured roles</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {featuredRoles.map((role) => (
              <article key={role.slug} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-gray-300 hover:shadow-xl">
                <h3 className="text-lg font-bold text-gray-900">{role.title}</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{role.department}</span>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{role.location}</span>
                </div>
              </article>
            ))}
          </div>
          <Link href="/careers/open-roles" className="mt-6 inline-flex text-sm font-bold text-amber-700 transition hover:text-amber-600">
            View all open roles -&gt;
          </Link>
        </div>
      </section>

      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Benefits</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">Built for focused, durable work.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit) => (
              <article key={benefit.label} className="rounded-xl border border-gray-200 bg-white p-6">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-amber-700">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    {benefit.icon}
                  </svg>
                </span>
                <h3 className="mt-4 font-bold text-gray-900">{benefit.label}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{benefit.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
