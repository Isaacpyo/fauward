'use client';

import { motion } from 'framer-motion';
import {
  MessageSquare,
  HelpCircle,
  Clock,
  LayoutDashboard,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  FileSpreadsheet,
} from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1] as const;

const headerContainer = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};
const headerItem = {
  hidden: { opacity: 0, y: 20, filter: 'blur(8px)' },
  show:   { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: EASE } },
};

/* ── Per-pain visual mockups ────────────────────────────────────── */

function WhatsAppMockup() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold">D</span>
          <div>
            <div className="text-xs font-semibold text-gray-900">Dispatch group</div>
            <div className="text-[10px] text-gray-500">5 operators · last msg 2m ago</div>
          </div>
        </div>
        <span className="text-[10px] font-mono text-gray-400">WhatsApp</span>
      </div>
      <div className="space-y-2">
        {[
          { who: 'Dispatcher', text: 'Marcus, where are you?', mine: false },
          { who: 'Marcus',     text: 'Still at depot, traffic',  mine: true  },
          { who: 'Dispatcher', text: 'Customer asking. ETA?',    mine: false },
          { who: 'Marcus',     text: '…',                        mine: true  },
        ].map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: m.mine ? 10 : -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.2 + i * 0.12, duration: 0.4, ease: EASE }}
            className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-xs ${
                m.mine ? 'rounded-tr-sm bg-green-100 text-green-900' : 'rounded-tl-sm bg-gray-100 text-gray-800'
              }`}
            >
              {m.text}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700">
        <AlertCircle size={11} />
        No update for 14 minutes
      </div>
    </div>
  );
}

function SupportInboxMockup() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-900">
          <Phone size={14} className="text-orange-600" />
          Inbound calls today
        </div>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">47 unanswered</span>
      </div>
      <div className="space-y-1.5">
        {[
          { from: 'Anita K.', reason: 'Where is FW-7821?',         time: '09:14' },
          { from: 'Tom R.',   reason: 'My parcel is late',          time: '09:18' },
          { from: 'Sade O.',  reason: 'Where is FW-7819?',          time: '09:22' },
          { from: 'James B.', reason: 'Did driver arrive?',         time: '09:31' },
        ].map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.2 + i * 0.08, duration: 0.4, ease: EASE }}
            className="flex items-center justify-between rounded-lg border border-gray-100 bg-orange-50/40 px-2.5 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-700">
                {c.from.split(' ')[0][0]}
              </span>
              <div>
                <div className="text-[11px] font-semibold text-gray-900">{c.from}</div>
                <div className="text-[10px] text-gray-500">{c.reason}</div>
              </div>
            </div>
            <span className="font-mono text-[10px] text-gray-400">{c.time}</span>
          </motion.div>
        ))}
      </div>
      <div className="mt-3 text-center text-[10px] text-gray-500">…and 43 more in the queue</div>
    </div>
  );
}

function SpreadsheetMockup() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
        <FileSpreadsheet size={14} className="text-emerald-700" />
        <span className="text-xs font-semibold text-gray-700">invoices_april.xlsx</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
          <Clock size={9} /> 3 days behind
        </span>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-[1.4fr_1fr_0.8fr] gap-2 border-b border-gray-100 px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          <span>Shipment</span><span>Delivered</span><span>Invoiced</span>
        </div>
        {[
          { ref: 'FW-7800', delivered: 'Apr 18', invoiced: '—',         late: true  },
          { ref: 'FW-7801', delivered: 'Apr 18', invoiced: '—',         late: true  },
          { ref: 'FW-7802', delivered: 'Apr 19', invoiced: 'Apr 21',    late: false },
          { ref: 'FW-7803', delivered: 'Apr 20', invoiced: '—',         late: true  },
        ].map((r, i) => (
          <motion.div
            key={r.ref}
            initial={{ opacity: 0, y: 4 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.2 + i * 0.08, duration: 0.35 }}
            className="grid grid-cols-[1.4fr_1fr_0.8fr] gap-2 border-b border-gray-50 px-2 py-1.5 last:border-0"
          >
            <span className="font-mono text-[11px] text-gray-700">{r.ref}</span>
            <span className="text-[11px] text-gray-600">{r.delivered}</span>
            <span className={`text-[11px] font-semibold ${r.late ? 'text-red-600' : 'text-gray-600'}`}>{r.invoiced}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ScatteredToolsMockup() {
  const TOOLS = [
    { label: 'WhatsApp',      bg: 'bg-green-100',  text: 'text-green-700'  },
    { label: 'Excel',         bg: 'bg-emerald-100',text: 'text-emerald-700'},
    { label: 'Email',         bg: 'bg-blue-100',   text: 'text-blue-700'   },
    { label: 'Carrier portal',bg: 'bg-purple-100', text: 'text-purple-700' },
    { label: 'Phone calls',   bg: 'bg-orange-100', text: 'text-orange-700' },
    { label: 'Stripe',        bg: 'bg-indigo-100', text: 'text-indigo-700' },
    { label: 'Telegram',      bg: 'bg-sky-100',    text: 'text-sky-700'    },
    { label: 'SMS',           bg: 'bg-pink-100',   text: 'text-pink-700'   },
  ];
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-900">
        <LayoutDashboard size={14} className="text-red-600" /> Tabs your team has open
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TOOLS.map((t, i) => (
          <motion.span
            key={t.label}
            initial={{ opacity: 0, scale: 0.85, rotate: -2 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.15 + i * 0.05, type: 'spring', stiffness: 300, damping: 18 }}
            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${t.bg} ${t.text}`}
          >
            {t.label}
          </motion.span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
        <AlertCircle size={12} />
        Nothing is the source of truth.
      </div>
    </div>
  );
}

/* ── Pain definitions ───────────────────────────────────────────── */

type Pain = {
  icon: typeof MessageSquare;
  step: string;
  title: string;
  desc: string;
  visual: () => JSX.Element;
  accent: { text: string; bg: string; border: string };
};

const PAINS: Pain[] = [
  {
    icon: MessageSquare,
    step: '01',
    title: 'Dispatchers chasing operators on WhatsApp',
    desc:  'No assignment system means every update is a phone call, a screenshot, or a message thread. By 10am the group chat already lost what happened.',
    visual: WhatsAppMockup,
    accent: { text: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
  },
  {
    icon: HelpCircle,
    step: '02',
    title: '"Where is my shipment?" all day',
    desc:  'Customers call because there is no tracking link. Every call drains 4 minutes — multiply by hundreds of shipments and it eats your team.',
    visual: SupportInboxMockup,
    accent: { text: '#c2410c', bg: '#ffedd5', border: '#fed7aa' },
  },
  {
    icon: Clock,
    step: '03',
    title: 'Invoices created days after delivery',
    desc:  'Finance waits for operators to confirm. By the time the invoice goes out, the customer has moved on and DSO climbs every week.',
    visual: SpreadsheetMockup,
    accent: { text: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  },
  {
    icon: LayoutDashboard,
    step: '04',
    title: 'No single view of shipment status',
    desc:  'Operations data scatters across WhatsApp, spreadsheets, email, carrier portals, and payment links. Nothing is the source of truth.',
    visual: ScatteredToolsMockup,
    accent: { text: '#b91c1c', bg: '#fee2e2', border: '#fecaca' },
  },
];

/* ── Section ────────────────────────────────────────────────────── */

export default function ProblemSection() {
  return (
    <section className="relative overflow-hidden bg-slate-50 py-20 lg:py-28">
      <div className="absolute inset-0 -z-10 bg-grid opacity-50" aria-hidden />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(ellipse, #fecaca 0%, #fed7aa 60%, transparent 100%)' }}
        animate={{ opacity: [0.3, 0.55, 0.3] }}
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
            <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
              <AlertCircle size={12} className="text-red-500" />
              <span className="relative z-10">The real cost of disconnected tools</span>
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
            Most logistics teams are still{' '}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 bg-clip-text text-transparent">
                stuck here
              </span>
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-red-400 via-orange-500 to-amber-500"
                initial={{ width: 0 }}
                whileInView={{ width: '100%' }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1, delay: 0.5, ease: EASE }}
              />
            </span>
          </motion.h2>

          <motion.p variants={headerItem} className="mt-4 text-base leading-relaxed text-gray-600">
            Four daily pains we hear from every operator we talk to.
          </motion.p>
        </motion.div>

        {/* Numbered vertical pains */}
        <div className="mx-auto max-w-5xl space-y-20 lg:space-y-24">
          {PAINS.map(({ icon: Icon, step, title, desc, visual: Visual, accent }, i) => {
            const reverse = i % 2 === 1;
            return (
              <motion.div
                key={step}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.2 }}
                className={`grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}
              >
                {/* Text */}
                <motion.div
                  variants={{
                    hidden: { opacity: 0, x: reverse ? 40 : -40, filter: 'blur(8px)' },
                    show:   { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: EASE } },
                  }}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-2xl font-mono text-base font-bold shadow-sm"
                      style={{ background: accent.bg, color: accent.text, borderColor: accent.border, borderWidth: 1 }}
                    >
                      {step}
                    </span>
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ background: accent.bg, color: accent.text }}
                    >
                      <Icon size={16} />
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold leading-tight text-gray-900 md:text-3xl">{title}</h3>
                  <p className="mt-4 text-base leading-relaxed text-gray-600">{desc}</p>
                </motion.div>

                {/* Visual */}
                <motion.div
                  variants={{
                    hidden: { opacity: 0, x: reverse ? -40 : 40, scale: 0.96, filter: 'blur(10px)' },
                    show:   { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)', transition: { duration: 0.8, delay: 0.15, ease: EASE } },
                  }}
                  className="relative"
                >
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl blur-3xl"
                    style={{ background: `linear-gradient(135deg, ${accent.bg}, ${accent.border})` }}
                    animate={{ opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <Visual />
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* Resolution */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="relative mx-auto mt-20 max-w-3xl overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 px-8 py-8 text-center shadow-sm"
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-400/30 blur-3xl"
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
              <Sparkles size={11} /> The fix
            </div>
            <div className="text-2xl font-bold text-amber-700 sm:text-3xl">One platform.</div>
            <div className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">Every operation.</div>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-amber-900/80">
              Fauward replaces all of it — from booking to proof of delivery to paid invoice — without the email + WhatsApp + spreadsheet juggle.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <CheckCircle2 size={14} /> Live in under 10 minutes
              <Mail size={1} aria-hidden className="hidden" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
