'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ClipboardList,
  UserCheck,
  Package,
  Truck,
  Bell,
  Camera,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Undo2,
  Sparkles,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1] as const;

type Stage = {
  icon: LucideIcon;
  label: string;
  actor: string;
  time: string;
  auto: boolean;
};

const STAGES: Stage[] = [
  { icon: ClipboardList, label: 'Booking Created',     actor: 'Dispatcher', time: '08:14', auto: false },
  { icon: UserCheck,     label: 'Operator Assigned',   actor: 'Agent',      time: '08:17', auto: true  },
  { icon: Package,       label: 'Picked Up',           actor: 'Operator',   time: '09:32', auto: false },
  { icon: Truck,         label: 'In Transit',          actor: 'GPS · Live', time: '09:34', auto: true  },
  { icon: Bell,          label: 'Customer Updated',    actor: 'System',     time: '09:35', auto: true  },
  { icon: Camera,        label: 'POD Captured',        actor: 'Operator',   time: '13:51', auto: false },
  { icon: FileText,      label: 'Invoice Generated',   actor: 'System',     time: '13:52', auto: true  },
  { icon: CheckCircle2,  label: 'Payment Reconciled',  actor: 'Gateway',    time: '14:22', auto: true  },
];

const headerContainer = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};
const headerItem = {
  hidden: { opacity: 0, y: 20, filter: 'blur(8px)' },
  show:   { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: EASE } },
};

const EXCEPTIONS = [
  { icon: AlertTriangle, label: 'Failed delivery',  detail: 'Agent flags exception, customer notified' },
  { icon: RotateCcw,     label: 'Reattempt',        detail: 'Auto-scheduled with new ETA window' },
  { icon: Undo2,         label: 'Returns',          detail: 'Return-to-sender workflow opens' },
];

export default function ShipmentLifecycleTimeline() {
  const [showExceptions, setShowExceptions] = useState(false);

  return (
    <section className="relative overflow-hidden bg-slate-50 py-20 lg:py-28">
      <div className="absolute inset-0 -z-10 bg-grid opacity-50" aria-hidden />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(ellipse, #fef3c7 0%, #fed7aa 60%, transparent 100%)' }}
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="marketing-container relative">
        {/* Header */}
        <motion.div
          className="mx-auto mb-14 max-w-2xl text-center"
          variants={headerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          <motion.div variants={headerItem} className="mb-4 inline-block">
            <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              <Sparkles size={12} className="text-amber-500" />
              <span className="relative z-10">End-to-end workflow</span>
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: '-120%' }}
                animate={{ x: '120%' }}
                transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
                style={{ background: 'linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.85) 50%, transparent 65%, transparent 100%)' }}
              />
            </span>
          </motion.div>

          <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
            One shipment.{' '}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                Eight steps
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
            . Zero manual chasing.
          </motion.h2>

          <motion.p variants={headerItem} className="mt-4 text-base leading-relaxed text-gray-600">
            From booking to payment, every step is tracked, automated where approved, and visible to the right people.
          </motion.p>
        </motion.div>

        {/* Desktop horizontal timeline */}
        <div className="hidden lg:block">
          <motion.div
            className="relative"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
          >
            <div className="relative mx-10 h-0.5 bg-gray-200">
              <motion.div
                aria-hidden
                className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500"
                variants={{
                  hidden: { scaleX: 0 },
                  show:   { scaleX: 1, transition: { duration: 1.4, ease: EASE } },
                }}
              />
            </div>

            <div className="-mt-3 grid grid-cols-8 gap-0">
              {STAGES.map(({ icon: Icon, label, actor, time, auto }, i) => (
                <motion.div
                  key={label}
                  className="flex flex-col items-center px-2 text-center"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ delay: 0.35 + i * 0.1, duration: 0.5, ease: EASE }}
                >
                  <motion.div
                    className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm ${
                      auto
                        ? 'border-amber-500 bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                        : 'border-amber-500 bg-white text-amber-600'
                    }`}
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ delay: 0.4 + i * 0.1, type: 'spring', stiffness: 320, damping: 18 }}
                  >
                    <Icon size={12} />
                  </motion.div>

                  <motion.div
                    className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-amber-200 hover:shadow-md"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ delay: 0.55 + i * 0.1, duration: 0.45, ease: EASE }}
                    whileHover={{ y: -3 }}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Step {String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="mt-1 text-sm font-semibold leading-tight text-gray-900">{label}</div>
                    <div className="mt-1 text-[11px] text-gray-500">{actor}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-gray-400">{time}</div>
                    {auto && (
                      <motion.span
                        className="mt-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
                        animate={{ opacity: [0.85, 1, 0.85] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <span className="h-1 w-1 rounded-full bg-white" />
                        AUTO
                      </motion.span>
                    )}
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Mobile vertical timeline */}
        <div className="space-y-0 lg:hidden">
          {STAGES.map(({ icon: Icon, label, actor, time, auto }, i) => (
            <motion.div
              key={label}
              className="flex gap-4"
              initial={{ opacity: 0, x: -16, filter: 'blur(6px)' }}
              whileInView={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm ${
                    auto
                      ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                      : 'border-2 border-amber-500 bg-white text-amber-600'
                  }`}
                >
                  <Icon size={15} />
                </div>
                {i < STAGES.length - 1 && (
                  <motion.div
                    className="my-1 w-0.5 flex-1 origin-top bg-gradient-to-b from-amber-300 to-amber-200"
                    initial={{ scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 + 0.2, duration: 0.4, ease: EASE }}
                  />
                )}
              </div>
              <div className="flex-1 pb-6">
                <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Step {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{label}</span>
                    {auto && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
                        AUTO
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {actor} · <span className="font-mono">{time}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Exception path — hidden by default, revealed via toggle */}
        <div className="mx-auto mt-12 max-w-4xl">
          <div className="flex justify-center">
            <motion.button
              type="button"
              onClick={() => setShowExceptions((v) => !v)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              aria-expanded={showExceptions}
              aria-controls="exception-path-panel"
              className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-amber-300 hover:text-amber-700"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle size={11} />
              </span>
              {showExceptions ? "Hide what happens when things go wrong" : "What if something goes wrong?"}
              <motion.span animate={{ rotate: showExceptions ? 180 : 0 }} transition={{ duration: 0.3 }}>
                <ChevronDown size={14} />
              </motion.span>
            </motion.button>
          </div>

          <AnimatePresence initial={false}>
            {showExceptions && (
              <motion.div
                key="exception-panel"
                id="exception-path-panel"
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -8 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="relative mt-6 overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 p-6 shadow-sm">
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute -inset-px -z-10 rounded-2xl opacity-50"
                    style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.18) 0%, transparent 50%, rgba(245,158,11,0.18) 100%)' }}
                    animate={{ opacity: [0.3, 0.55, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="shrink-0">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-md">
                        <AlertTriangle size={20} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-700">
                        Exception path
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">When delivery doesn&apos;t go to plan</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Fauward Agent detects, flags, and recovers — no shipment goes silent.
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {EXCEPTIONS.map((e, i) => (
                          <motion.div
                            key={e.label}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 + i * 0.08, duration: 0.4, ease: EASE }}
                            className="rounded-lg border border-red-100 bg-white p-3"
                          >
                            <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-50 text-red-600">
                              <e.icon size={14} />
                            </div>
                            <div className="text-xs font-bold text-gray-900">{e.label}</div>
                            <div className="mt-0.5 text-[11px] leading-snug text-gray-600">{e.detail}</div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
