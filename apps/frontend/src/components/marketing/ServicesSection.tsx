import Link from "next/link";
import { SERVICES } from "@/lib/marketing-data";
import { Package, Smartphone, FileText, MapPin, Layout, Code } from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  package: Package,
  smartphone: Smartphone,
  "file-text": FileText,
  "map-pin": MapPin,
  layout: Layout,
  code: Code,
};

export default function ServicesSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="marketing-container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-600">Our Services</p>
          <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">
            Everything a logistics business needs — in one platform
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            From driver mobile apps to invoice auto-generation, every capability is built for the realities of running freight and courier operations.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => {
            const Icon = ICON_MAP[service.icon] ?? Package;
            return (
              <div
                key={service.slug}
                className="card-lift group rounded-2xl border border-gray-200 bg-white p-7 shadow-sm"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Icon size={24} />
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">{service.title}</h3>
                <p className="mb-4 text-sm leading-relaxed text-gray-600">{service.summary}</p>
                <ul className="space-y-1.5">
                  {service.bullets.slice(0, 3).map((b) => (
                    <li key={b} className="flex items-start gap-2 text-xs text-gray-700">
                      <span className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207z" />
                        </svg>
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/services"
            className="inline-flex h-12 items-center gap-2 rounded-lg border border-gray-300 px-7 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 hover:border-gray-400"
          >
            View all services
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
