'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  MapPin,
  QrCode,
  ShieldCheck,
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

const FEATURES: Feature[] = [
  { icon: QrCode,        text: 'QR scan for collection and delivery confirmation' },
  { icon: ShieldCheck,   text: 'OTP verification before releasing a shipment' },
  { icon: Camera,        text: 'Photo proof and digital signature capture' },
  { icon: WifiOff,       text: 'Offline-first — works with no signal, syncs when back online' },
  { icon: MapPin,        text: 'GPS location updates throughout the route' },
  { icon: AlertTriangle, text: 'Failed delivery reason capture and escalation' },
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

function PhoneMockup() {
  return (
    <motion.div
      className="relative mx-auto w-full max-w-[520px]"
      initial={{ opacity: 0, scale: 0.94, y: 28 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <Image
        src="/images/screens/fauward-go-app.png"
        alt="Fauward Go mobile app home screen showing assigned jobs, queued offline updates, verified scans, proof-of-delivery drafts and a QR scan shortcut"
        width={1086}
        height={1448}
        sizes="(min-width: 1024px) 520px, 100vw"
        className="h-auto w-full rounded-3xl shadow-[0_28px_90px_-32px_rgba(0,0,0,0.85)]"
      />
    </motion.div>
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
