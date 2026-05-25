'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Camera,
  Check,
  Home,
  MapPin,
  Navigation,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Signal,
  Smartphone,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

type Feature = {
  icon: LucideIcon;
  text: string;
};

type AppStat = {
  label: string;
  value: string;
  helper: string;
  tone: string;
};

const FEATURES: Feature[] = [
  { icon: QrCode,        text: 'QR scan for collection and delivery confirmation' },
  { icon: ShieldCheck,   text: 'OTP verification before releasing a shipment' },
  { icon: Camera,        text: 'Photo proof and digital signature capture' },
  { icon: WifiOff,       text: 'Offline-first — works with no signal, syncs when back online' },
  { icon: MapPin,        text: 'GPS location updates throughout the route' },
  { icon: AlertTriangle, text: 'Failed delivery reason capture and escalation' },
];

const APP_STATS: AppStat[] = [
  { label: 'Assigned', value: '18', helper: 'open stops', tone: 'from-white to-slate-50' },
  { label: 'Queued', value: '7', helper: 'offline-safe updates', tone: 'from-white to-blue-50' },
  { label: 'Verified', value: '42', helper: 'matched shipment scans', tone: 'from-white to-emerald-50' },
  { label: 'POD', value: '11', helper: 'drafts awaiting upload', tone: 'from-white to-amber-50' },
];

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

function PhoneNavItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl px-2 text-[0.64rem] font-bold uppercase tracking-[0.16em] ${
        active ? 'bg-[#0d1f3c] text-white shadow-sm' : 'text-stone-500'
      }`}
    >
      <Icon size={13} />
      <span>{label}</span>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <motion.div
        className="absolute -left-2 top-16 hidden w-40 rounded-xl border border-white/10 bg-white/[0.07] p-3 text-white shadow-xl backdrop-blur lg:block xl:-left-8"
        initial={{ opacity: 0, x: 16, y: 8 }}
        whileInView={{ opacity: 1, x: 0, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ delay: 0.45, duration: 0.55, ease: EASE }}
      >
        <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-blue-200">
          <Navigation size={12} />
          Route live
        </div>
        <p className="mt-2 text-xl font-bold">24 stops</p>
        <p className="mt-1 text-xs leading-snug text-blue-100/70">3 depots, 2 return pickups, 91% SLA cover.</p>
      </motion.div>

      <motion.div
        className="absolute -right-2 bottom-24 hidden w-44 rounded-xl border border-white/10 bg-white/[0.07] p-3 text-white shadow-xl backdrop-blur lg:block xl:-right-8"
        initial={{ opacity: 0, x: -16, y: 8 }}
        whileInView={{ opacity: 1, x: 0, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ delay: 0.58, duration: 0.55, ease: EASE }}
      >
        <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-200">
          <Signal size={12} />
          Sync health
        </div>
        <p className="mt-2 text-xl font-bold">1.8s</p>
        <p className="mt-1 text-xs leading-snug text-blue-100/70">Average replay after operators reconnect.</p>
      </motion.div>

      <motion.div
        className="relative z-10 mx-auto w-full max-w-[342px] rounded-[2rem] border border-white/15 bg-slate-950/40 p-2 shadow-[0_28px_90px_-32px_rgba(0,0,0,0.85)]"
        initial={{ opacity: 0, scale: 0.94, y: 28 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-[#f4f5f7]">
          <div className="flex min-h-[660px] flex-col p-3">
            <div className="rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <Image
                      src="/brand/logo-mark.png"
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 object-contain"
                    />
                    <div>
                      <p className="font-mono text-[1.05rem] font-bold leading-none tracking-[0.08em] text-[#0d1f3c]">
                        FAUWARD GO
                      </p>
                      <p className="mt-1 text-[0.64rem] font-bold uppercase tracking-[0.22em] text-blue-600">
                        Mobile execution
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-stone-600">Quick Ship - Field Operator</p>
                </div>
                <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Online
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.24em] text-stone-500">
                  Search assigned jobs
                </p>
                <RefreshCw size={15} className="text-[#0d1f3c]" />
              </div>
              <div className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs text-stone-400">
                <Search size={14} />
                <span>Search by reference number or name</span>
              </div>
              <div className="mt-3 flex h-11 items-center justify-center rounded-2xl bg-[#0d1f3c] text-sm font-bold text-white">
                Search
              </div>
              <div className="mt-3 flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-[#0d1f3c]">
                <QrCode size={16} />
                Scan QR code
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {APP_STATS.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  className={`rounded-[1.35rem] border border-slate-200 bg-gradient-to-br ${stat.tone} p-4 shadow-sm`}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ delay: 0.3 + index * 0.08, duration: 0.45, ease: EASE }}
                >
                  <p className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-stone-500">
                    {stat.label}
                  </p>
                  <p className="mt-3 text-3xl font-bold leading-none text-[#0d1f3c]">{stat.value}</p>
                  <p className="mt-3 min-h-[32px] text-xs leading-snug text-stone-600">{stat.helper}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-4 rounded-[1.35rem] border border-blue-200 bg-blue-50 p-4 shadow-sm">
              <p className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-[#0d1f3c]">Verification</p>
              <h3 className="mt-2 text-base font-bold leading-snug text-[#0d1f3c]">
                Scan shipment, package, or label
              </h3>
              <p className="mt-2 text-xs text-slate-700">Live scanner plus manual fallback.</p>
            </div>

            <div className="mt-auto pt-3">
              <div className="grid grid-cols-3 gap-1 rounded-[1.4rem] border border-slate-200 bg-white p-2 shadow-sm">
                <PhoneNavItem icon={Home} label="Home" active />
                <PhoneNavItem icon={BriefcaseBusiness} label="Jobs" />
                <PhoneNavItem icon={Settings} label="Settings" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function FauwardGoSection() {
  return (
    <section className="relative overflow-hidden bg-dark-bg py-20 lg:py-28">
      <div className="absolute inset-0 -z-10 bg-dark-grid" aria-hidden />
      {/* Glow orbs */}
      <motion.div
        className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl"
        animate={{ opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -right-20 bottom-1/4 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        aria-hidden
      />

      <div className="marketing-container relative">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
          {/* Copy */}
          <motion.div
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                <Smartphone size={12} />
                <span className="relative z-10">Fauward Go</span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: '-120%' }}
                  animate={{ x: '120%' }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
                  style={{
                    background:
                      'linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%, transparent 100%)',
                  }}
                />
              </span>
            </motion.div>

            <motion.h2
              variants={headerItem}
              className="text-3xl font-bold leading-tight text-white md:text-4xl lg:text-5xl"
            >
              Field operations,{' '}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 bg-clip-text text-transparent">
                  built for the road.
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400"
                  initial={{ width: 0 }}
                  whileInView={{ width: '100%' }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 1, delay: 0.5, ease: EASE }}
                />
              </span>
            </motion.h2>

            <motion.p
              variants={headerItem}
              className="mt-5 text-lg leading-relaxed text-blue-100/80"
            >
              Fauward Go is the field operator PWA — mobile-first for shipment creation, warehouse intake, dispatch, pickup, linehaul, delivery, and returns. It works offline, captures proof, confirms OTP, and syncs automatically — so your team focuses on the field, not the paperwork.
            </motion.p>

            <motion.ul variants={headerItem} className="mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, text }, i) => (
                <motion.li
                  key={text}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: 0.4 + i * 0.06, duration: 0.5, ease: EASE }}
                  className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400">
                    <Icon size={12} />
                  </span>
                  <span className="text-xs leading-snug text-blue-100/85">{text}</span>
                </motion.li>
              ))}
            </motion.ul>

            <motion.div variants={headerItem} className="mt-8 flex flex-wrap items-center gap-3">
              <MotionLink
                href="/fauward-go"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-lg bg-amber-500 px-7 text-sm font-semibold text-gray-900 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)]"
              >
                <span className="relative z-10 inline-flex items-center gap-2">
                  Learn about Fauward Go
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.7, ease: EASE }}
                  style={{
                    background:
                      'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
                  }}
                />
              </MotionLink>
              <MotionLink
                href="/signup"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-7 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/10"
              >
                Start free trial
                <Check size={14} className="text-amber-400" />
              </MotionLink>
            </motion.div>
          </motion.div>

          {/* Phone mockup */}
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
