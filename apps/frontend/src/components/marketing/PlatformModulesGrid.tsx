import Link from 'next/link';
import { Package, MapPin, Smartphone, Receipt, Zap, Palette, Plug, Shield, ChevronRight, Check } from 'lucide-react';

const MODULES = [
  {
    icon: Package,
    title: 'Shipment Operations',
    desc:  'Full lifecycle from booking to proof of delivery.',
    bullets: ['Create, assign, and track shipments', 'Real-time driver updates', 'SLA monitoring and alerts'],
    badge:  'Live',
    badgeClass: 'bg-green-950/60 text-green-400 border-green-800/50',
    href:  '/features/shipment-management',
    accent: 'group-hover:text-blue-400',
  },
  {
    icon: MapPin,
    title: 'Customer Tracking',
    desc:  'Branded tracking links — no login needed.',
    bullets: ['Public tracking page per shipment', 'Live status and ETA', 'Proof of delivery confirmation'],
    badge:  'Live',
    badgeClass: 'bg-green-950/60 text-green-400 border-green-800/50',
    href:  '/customer-tracking',
    accent: 'group-hover:text-blue-400',
  },
  {
    icon: Smartphone,
    title: 'Fauward Go',
    desc:  'Field operations PWA for drivers and field agents.',
    bullets: ['Offline-first with background sync', 'QR scan, OTP, signature, photo proof', 'Failed delivery workflow'],
    badge:  'Live',
    badgeClass: 'bg-green-950/60 text-green-400 border-green-800/50',
    href:  '/fauward-go',
    accent: 'group-hover:text-amber-400',
  },
  {
    icon: Receipt,
    title: 'Finance & Invoicing',
    desc:  'Auto-generate invoices on delivery confirmation.',
    bullets: ['Invoice on POD capture', 'Payment link delivery via email/SMS', 'COD, multi-currency, overdue reminders'],
    badge:  'Live',
    badgeClass: 'bg-green-950/60 text-green-400 border-green-800/50',
    href:  '/features/finance',
    accent: 'group-hover:text-green-400',
  },
  {
    icon: Zap,
    title: 'Fauward Agent',
    desc:  'Operations monitoring and workflow automation.',
    bullets: ['SLA risk detection and flagging', 'Driver reassignment suggestions', 'Dispatcher-approved automation'],
    badge:  'Live',
    badgeClass: 'bg-green-950/60 text-green-400 border-green-800/50',
    href:  '/agent',
    accent: 'group-hover:text-purple-400',
  },
  {
    icon: Palette,
    title: 'White-Label Platform',
    desc:  'Your brand, your domain, your colours.',
    bullets: ['Custom subdomain per tenant', 'Tenant-scoped branding and CSS', 'Customer-facing pages fully branded'],
    badge:  'Live',
    badgeClass: 'bg-green-950/60 text-green-400 border-green-800/50',
    href:  '/features/white-label',
    accent: 'group-hover:text-amber-400',
  },
  {
    icon: Plug,
    title: 'API & Integrations',
    desc:  'Connect Fauward to your existing tools.',
    bullets: ['REST API with webhook events', 'Carrier and 3PL integration-ready', 'Zapier and n8n compatible'],
    badge:  'Integration-Ready',
    badgeClass: 'bg-slate-800/60 text-slate-400 border-slate-700/50',
    href:  '/features/api-integrations',
    accent: 'group-hover:text-blue-400',
  },
  {
    icon: Shield,
    title: 'Multi-Tenant Control',
    desc:  'Manage every account from a single admin view.',
    bullets: ['Tenant isolation and RBAC', 'Usage monitoring per account', 'Plan-gated feature access'],
    badge:  'Live',
    badgeClass: 'bg-green-950/60 text-green-400 border-green-800/50',
    href:  '/features',
    accent: 'group-hover:text-blue-400',
  },
];

export default function PlatformModulesGrid() {
  return (
    <section className="bg-dark-bg py-20">
      <div className="marketing-container">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            The platform
          </p>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Everything your team needs — in one place
          </h2>
          <p className="mt-4 text-base text-blue-100/60 leading-relaxed">
            Built for couriers, freight operators, and 3PL providers who want operational control without enterprise complexity.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map(({ icon: Icon, title, desc, bullets, badge, badgeClass, href, accent }) => (
            <Link
              key={title}
              href={href}
              className="group relative flex flex-col rounded-xl border border-dark-border bg-dark-card p-5 transition hover:-translate-y-0.5 hover:border-blue-800/60 hover:bg-dark-elevated"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-surface border border-dark-border">
                  <Icon size={18} className={`text-gray-400 transition ${accent}`} />
                </div>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                  {badge}
                </span>
              </div>

              <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
              <p className="text-xs text-blue-200/50 leading-relaxed mb-4">{desc}</p>

              <ul className="space-y-1.5 mt-auto">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-xs text-gray-400">
                    <Check size={11} className="text-green-500 mt-0.5 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>

              <div className={`mt-4 flex items-center gap-1 text-xs font-semibold text-gray-500 transition ${accent}`}>
                Learn more <ChevronRight size={12} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
