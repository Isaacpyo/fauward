'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Package,
  MapPin,
  Smartphone,
  Receipt,
  Zap,
  Palette,
  Plug,
  Shield,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';

type Accent = 'blue' | 'amber' | 'green';

type Module = {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
  accent: Accent;
};

const ACCENTS: Record<Accent, { gradient: string; glow: string }> = {
  blue:  { gradient: 'linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)', glow: 'rgba(37, 99, 235, 0.45)' },
  amber: { gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)', glow: 'rgba(245, 158, 11, 0.45)' },
  green: { gradient: 'linear-gradient(135deg, #16a34a 0%, #14532d 100%)', glow: 'rgba(22, 163, 74, 0.45)' },
};

const MODULES: Module[] = [
  {
    icon: Package,
    title: 'Shipment Operations',
    desc:  'End-to-end lifecycle management from booking through proof-of-delivery — built for couriers, freight operators, and last-mile businesses.',
    href:  '/features/shipment-management',
    accent: 'blue',
  },
  {
    icon: MapPin,
    title: 'Customer Tracking',
    desc:  'Give customers a fully branded, public tracking experience on your domain — no login required, no Fauward branding.',
    href:  '/customer-tracking',
    accent: 'amber',
  },
  {
    icon: Smartphone,
    title: 'Fauward Go',
    desc:  'Purpose-built field operations app that works on and offline — capturing signatures, photos, and barcodes for irrefutable proof-of-delivery.',
    href:  '/fauward-go',
    accent: 'green',
  },
  {
    icon: Receipt,
    title: 'Finance & Invoicing',
    desc:  'Auto-generate invoices on delivery confirmation and collect payments across every major regional method — without touching a spreadsheet.',
    href:  '/features/finance',
    accent: 'blue',
  },
  {
    icon: Zap,
    title: 'Fauward Agent',
    desc:  'Operations monitoring and workflow automation that flags risks early and recommends actions — keeping dispatchers in control.',
    href:  '/agent',
    accent: 'amber',
  },
  {
    icon: Palette,
    title: 'White-Label Platform',
    desc:  'Launch a complete branded logistics portal under your own domain, colours, and logo in under 10 minutes — no engineers needed.',
    href:  '/features/white-label',
    accent: 'green',
  },
  {
    icon: Plug,
    title: 'API & Integrations',
    desc:  'Connect Fauward to your existing stack via REST API, webhooks, or direct carrier integrations — all documented and versioned.',
    href:  '/features/api-integrations',
    accent: 'blue',
  },
  {
    icon: Shield,
    title: 'Multi-Tenant Control',
    desc:  'Manage every account from a single admin view with strict tenant isolation, RBAC, and plan-gated feature access.',
    href:  '/features',
    accent: 'amber',
  },
];

const MotionLink = motion(Link);

const EASE = [0.22, 1, 0.36, 1] as const;

const cardEntrance = (index: number) => ({
  hidden: { opacity: 0, x: -60, scale: 0.92, filter: 'blur(12px)' },
  show:   {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.7,
      delay: (index % 4) * 0.18,
      ease: EASE,
    },
  },
});

const headerContainer = {
  hidden: { opacity: 0 },
  show:   {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.05 },
  },
};

const headerItem = {
  hidden: { opacity: 0, y: 20, filter: 'blur(8px)' },
  show:   {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: EASE },
  },
};

function ModuleCard({ icon: Icon, title, desc, href, accent, index }: Module & { index: number }) {
  const { gradient, glow } = ACCENTS[accent];

  return (
    <motion.div
      variants={cardEntrance(index)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
    >
    <MotionLink
      href={href}
      initial="rest"
      animate="rest"
      whileHover="hover"
      className="group relative isolate flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6"
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 -z-10"
        variants={{
          rest:  { y: '100%', opacity: 0 },
          hover: { y: '0%',   opacity: 1 },
        }}
        transition={{ duration: 0.45, ease: EASE }}
        style={{ background: gradient }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-1 -z-10 h-32 blur-2xl"
        variants={{
          rest:  { opacity: 0 },
          hover: { opacity: 0.55 },
        }}
        transition={{ duration: 0.45 }}
        style={{ background: glow }}
      />

      <motion.div
        className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border"
        variants={{
          rest:  { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' },
          hover: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)' },
        }}
        transition={{ duration: 0.3 }}
      >
        <motion.span
          variants={{
            rest:  { color: '#6b7280', scale: 1 },
            hover: { color: '#ffffff',  scale: 1.08 },
          }}
          transition={{ duration: 0.3 }}
        >
          <Icon size={22} />
        </motion.span>
      </motion.div>

      <motion.h3
        className="mb-2 text-xl font-semibold"
        variants={{
          rest:  { color: '#111827' },
          hover: { color: '#ffffff' },
        }}
        transition={{ duration: 0.3 }}
      >
        {title}
      </motion.h3>

      <motion.p
        className="mb-6 text-sm leading-relaxed"
        variants={{
          rest:  { color: '#4b5563' },
          hover: { color: 'rgba(255,255,255,0.88)' },
        }}
        transition={{ duration: 0.3 }}
      >
        {desc}
      </motion.p>

      <motion.div
        className="mt-auto inline-flex items-center gap-1 text-xs font-semibold"
        variants={{
          rest:  { color: '#6b7280' },
          hover: { color: '#ffffff' },
        }}
        transition={{ duration: 0.3 }}
      >
        Learn more
        <motion.span
          variants={{
            rest:  { x: 0 },
            hover: { x: 4 },
          }}
          transition={{ duration: 0.3 }}
        >
          <ChevronRight size={14} />
        </motion.span>
      </motion.div>
    </MotionLink>
    </motion.div>
  );
}

export default function PlatformModulesGrid() {
  return (
    <section className="bg-slate-50 py-20">
      <div className="marketing-container">
        <motion.div
          className="mx-auto mb-12 max-w-2xl text-center"
          variants={headerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          {/* Eyebrow with subtle glow pill */}
          <motion.div variants={headerItem} className="mb-4 inline-block">
            <span className="relative inline-flex items-center overflow-hidden rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              <span className="relative z-10">The platform · Every service</span>
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: '-120%' }}
                animate={{ x: '120%' }}
                transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' }}
                style={{
                  background:
                    'linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.85) 50%, transparent 65%, transparent 100%)',
                }}
              />
            </span>
          </motion.div>

          {/* Headline with gradient highlight + animated underline */}
          <motion.h2
            variants={headerItem}
            className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl"
          >
            Everything a logistics business needs —{' '}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                in one place
              </span>
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
                initial={{ width: 0 }}
                whileInView={{ width: '100%' }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1, delay: 0.5, ease: EASE }}
              />
            </span>
          </motion.h2>

          <motion.p
            variants={headerItem}
            className="mt-4 text-base leading-relaxed text-gray-600"
          >
            From driver mobile apps to invoice auto-generation, every capability is built for the realities of running freight and courier operations — without enterprise complexity.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m, i) => (
            <ModuleCard key={m.title} {...m} index={i} />
          ))}
        </div>

        <div className="mt-10 text-center">
          <MotionLink
            href="/services"
            initial="rest"
            whileHover="hover"
            animate="rest"
            className="relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-lg border px-7 text-sm font-semibold shadow-sm"
            variants={{
              rest:  { borderColor: '#d1d5db', color: '#374151' },
              hover: { borderColor: '#b45309', color: '#ffffff' },
            }}
            transition={{ duration: 0.3 }}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 -z-0"
              variants={{
                rest:  { y: '100%' },
                hover: { y: '0%' },
              }}
              transition={{ duration: 0.4, ease: EASE }}
              style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)' }}
            />
            <span className="relative z-10 inline-flex items-center gap-2">
              View all services
              <motion.span
                variants={{
                  rest:  { x: 0 },
                  hover: { x: 4 },
                }}
                transition={{ duration: 0.3 }}
              >
                <ChevronRight size={16} />
              </motion.span>
            </span>
          </MotionLink>
        </div>
      </div>
    </section>
  );
}
