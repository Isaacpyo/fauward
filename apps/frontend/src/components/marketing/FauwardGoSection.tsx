'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  QrCode,
  ShieldCheck,
  Camera,
  WifiOff,
  MapPin,
  AlertTriangle,
  Check,
  ArrowRight,
  Smartphone,
  Signal,
  RefreshCw,
} from 'lucide-react';

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const FEATURES = [
  { icon: QrCode,        text: 'QR scan for collection and delivery confirmation' },
  { icon: ShieldCheck,   text: 'OTP verification before releasing a shipment' },
  { icon: Camera,        text: 'Photo proof and digital signature capture' },
  { icon: WifiOff,       text: 'Offline-first — works with no signal, syncs when back online' },
  { icon: MapPin,        text: 'GPS location updates throughout the route' },
  { icon: AlertTriangle, text: 'Failed delivery reason capture and escalation' },
];

const JOBS = [
  { ref: 'FW-7821', address: '14 Brook St, Manchester', status: 'Out for delivery', pillBg: 'bg-blue-500/20 text-blue-300', dot: 'bg-blue-400' },
  { ref: 'FW-7819', address: '2 Canal Rd, Leeds',        status: 'POD required',     pillBg: 'bg-amber-500/20 text-amber-300', dot: 'bg-amber-400' },
  { ref: 'FW-7815', address: '88 Park Lane, Sheffield',   status: 'Scheduled',        pillBg: 'bg-white/10 text-blue-200', dot: 'bg-blue-200' },
];

const FLOATING_BADGES = [
  { icon: Signal,      label: 'Online',         tone: 'text-green-300 border-green-500/30 bg-green-500/10',  pos: { top: '6%',  left:  '4%'  } },
  { icon: Camera,      label: 'Photo captured', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',  pos: { top: '14%', right: '4%'  } },
  { icon: ShieldCheck, label: 'OTP verified',   tone: 'text-blue-300  border-blue-500/30  bg-blue-500/10',   pos: { top: '46%', left:  '0%'  } },
  { icon: RefreshCw,   label: 'Syncing 3 jobs', tone: 'text-purple-300 border-purple-500/30 bg-purple-500/10', pos: { top: '52%', right: '0%'  } },
  { icon: MapPin,      label: 'GPS live',       tone: 'text-green-300 border-green-500/30 bg-green-500/10',  pos: { bottom: '14%', left:  '5%' } },
  { icon: WifiOff,     label: 'Offline-safe',   tone: 'text-blue-300  border-blue-500/30  bg-blue-500/10',   pos: { bottom: '20%', right: '5%' } },
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
    <div className="relative mx-auto w-full max-w-md">
      {/* Floating badges around the phone */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {FLOATING_BADGES.map((b, i) => (
          <motion.span
            key={b.label}
            className={`absolute hidden whitespace-nowrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold shadow-lg backdrop-blur-sm xl:inline-flex ${b.tone}`}
            style={b.pos}
            initial={{ opacity: 0, scale: 0.7, y: 6 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.5 + i * 0.1, duration: 0.5, ease: EASE }}
          >
            <b.icon size={11} /> {b.label}
          </motion.span>
        ))}
      </div>

      {/* Phone */}
      <motion.div
        className="relative z-10 mx-auto w-[260px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#070f1f] p-1.5 shadow-2xl"
        initial={{ opacity: 0, scale: 0.92, y: 30 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        {/* Animated gradient rim glow */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-px -z-10 rounded-[2.5rem]"
          style={{
            background:
              'linear-gradient(135deg, rgba(245,158,11,0.4) 0%, transparent 50%, rgba(59,130,246,0.4) 100%)',
          }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative overflow-hidden rounded-[2.2rem] bg-[#0a1628]">
          {/* Notch */}
          <div className="flex justify-center pt-2">
            <div className="h-5 w-24 rounded-b-2xl bg-black" />
          </div>

          {/* App header */}
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div>
              <div className="text-xs font-bold text-white">Fauward Go</div>
              <div className="text-[10px] text-gray-500">Marcus Osei · Driver</div>
            </div>
            <div className="flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
              <span className="text-[10px] font-semibold text-green-400">Online</span>
            </div>
          </div>

          {/* Summary */}
          <div className="px-4 pt-3">
            <motion.div
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <div className="text-sm font-bold text-amber-300">3 jobs today</div>
              <div className="text-[10px] text-amber-400/80">1 completed · 2 active</div>
            </motion.div>
          </div>

          {/* Jobs list */}
          <div className="space-y-2 px-4 py-3">
            {JOBS.map((job, i) => (
              <motion.div
                key={job.ref}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5"
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.12, duration: 0.5, ease: EASE }}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-gray-300">{job.ref}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${job.pillBg}`}>
                    <span className={`h-1 w-1 rounded-full ${job.dot}`} />
                    {job.status}
                  </span>
                </div>
                <p className="text-[10px] leading-snug text-gray-400">{job.address}</p>
              </motion.div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-1.5 border-t border-white/5 px-3 py-3">
            {[
              { label: 'Scan QR',     icon: QrCode },
              { label: 'OTP',         icon: ShieldCheck },
              { label: 'Photo',       icon: Camera },
            ].map((b) => (
              <motion.button
                key={b.label}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-[10px] text-gray-300 transition hover:border-amber-500/40 hover:text-amber-300"
              >
                <b.icon size={14} />
                {b.label}
              </motion.button>
            ))}
          </div>

          {/* Sync indicator */}
          <div className="flex items-center gap-1.5 border-t border-white/5 px-4 py-2">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
              className="text-blue-400"
            >
              <RefreshCw size={10} />
            </motion.span>
            <span className="font-mono text-[10px] text-blue-300/80">Syncing offline jobs…</span>
            <span className="ml-auto text-[10px] text-blue-400/60">2 pending</span>
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
              Fauward Go is the driver and field agent PWA. It works offline, captures proof, confirms OTP, and syncs automatically — so your team can focus on delivering, not reporting.
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
