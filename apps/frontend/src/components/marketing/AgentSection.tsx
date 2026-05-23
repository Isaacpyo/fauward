'use client';

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Cpu,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  Bell,
  Link2,
  Sparkles,
  Send,
  Check,
  ArrowRight,
  Bot,
  Package,
  Truck,
  ShieldCheck,
} from "lucide-react";

import { AGENT_CAPABILITIES } from "@/lib/marketing-data";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const ICON_MAP: Record<string, typeof Cpu> = {
  cpu: Cpu,
  "alert-triangle": AlertTriangle,
  "message-square": MessageSquare,
  "trending-up": TrendingUp,
  bell: Bell,
  link: Link2,
};

const CAPABILITY_TAGS = [
  "SLA monitoring",
  "Driver routing",
  "Exception flagging",
  "Customer notifications",
  "Invoice escalation",
  "Dispatcher approvals",
  "Live ops Q&A",
  "Carrier scoring",
];

const headerContainer = {
  hidden: { opacity: 0 },
  show:   {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.05 },
  },
};

const headerItem = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show:   {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE },
  },
};

function ChatMockup() {
  return (
    <div className="relative mx-auto w-full max-w-3xl">
      {/* Floating capability tags around the chat (sit in the gutter beside it on large screens) */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {CAPABILITY_TAGS.map((tag, i) => {
          const positions = [
            { top: "4%",   left:  "2%"  },
            { top: "10%",  right: "2%"  },
            { top: "32%",  left:  "0%"  },
            { top: "28%",  right: "0%"  },
            { top: "58%",  left:  "1%"  },
            { top: "60%",  right: "1%"  },
            { bottom: "8%", left: "3%"  },
            { bottom: "10%", right: "3%" },
          ] as const;
          const pos = positions[i] ?? {};
          return (
            <motion.span
              key={tag}
              className="absolute hidden whitespace-nowrap rounded-full border border-white/15 bg-[#0a1628]/90 px-3 py-1 text-[11px] font-medium text-blue-100 shadow-lg backdrop-blur-sm xl:inline-flex"
              style={pos}
              initial={{ opacity: 0, scale: 0.7, y: 6 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: 0.6 + i * 0.08, duration: 0.5, ease: EASE }}
            >
              {tag}
            </motion.span>
          );
        })}
      </div>

      <motion.div
        className="relative z-10 mx-auto max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#060e1c] shadow-2xl"
        initial={{ opacity: 0, scale: 0.95, y: 24 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        {/* Soft glow rim */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-px -z-10 rounded-3xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(245,158,11,0.35) 0%, transparent 50%, rgba(59,130,246,0.35) 100%)",
          }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <Bot size={14} />
            </span>
            <div>
              <div className="text-xs font-semibold text-white">Fauward Agent</div>
              <div className="flex items-center gap-1 text-[10px] text-blue-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                </span>
                Monitoring 847 active shipments
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
            <ShieldCheck size={10} /> Verified
          </span>
        </div>

        {/* Conversation body */}
        <div className="space-y-4 px-5 py-6">
          {/* User message */}
          <motion.div
            className="flex justify-end"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.3, duration: 0.5, ease: EASE }}
          >
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm text-white shadow-lg shadow-blue-900/40">
              Any SLA risks across all tenants this afternoon?
            </div>
          </motion.div>

          {/* Typing indicator */}
          <motion.div
            className="flex items-center gap-2 text-xs text-blue-300"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.7, duration: 0.4 }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <Bot size={12} />
            </span>
            <span>Fauward Agent is analysing</span>
            <span className="flex gap-1">
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="h-1.5 w-1.5 rounded-full bg-amber-400"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2, ease: "easeInOut" }}
                />
              ))}
            </span>
          </motion.div>

          {/* Agent response card */}
          <motion.div
            className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] p-4"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 1.2, duration: 0.6, ease: EASE }}
          >
            <div className="mb-3 flex items-center gap-2 text-sm text-blue-100">
              <Sparkles size={14} className="text-amber-400" />
              <span>
                Found <span className="font-bold text-amber-400">2 shipments</span> at risk of breaching SLA by 16:00.
              </span>
            </div>
            <div className="space-y-2">
              {[
                {
                  ref: "FW-7821",
                  route: "Manchester → Leeds",
                  risk: "+38 min vs SLA",
                  action: "Reassign to Carrier B",
                  riskColor: "text-red-400",
                  pillBg: "bg-red-500/15 text-red-300",
                  icon: AlertTriangle,
                },
                {
                  ref: "FW-7834",
                  route: "Dubai → Riyadh",
                  risk: "+22 min vs SLA",
                  action: "Notify customer + flag",
                  riskColor: "text-amber-400",
                  pillBg: "bg-amber-500/15 text-amber-300",
                  icon: Truck,
                },
              ].map((s, i) => (
                <motion.div
                  key={s.ref}
                  className="rounded-lg border border-white/10 bg-[#0a1628] p-3"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: 1.4 + i * 0.15, duration: 0.5, ease: EASE }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/5">
                        <s.icon size={12} className={s.riskColor} />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white">{s.ref}</div>
                        <div className="text-[10px] text-blue-300">{s.route}</div>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.pillBg}`}>
                      {s.risk}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
                    <span className="text-[11px] text-amber-200">
                      Suggested: <span className="font-semibold text-amber-300">{s.action}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                      Awaiting approval <Check size={10} />
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
            <motion.div
              className="mt-3 flex items-center justify-between text-[11px] text-blue-300"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: 1.9, duration: 0.4 }}
            >
              <span className="inline-flex items-center gap-1">
                <Package size={11} />
                Customer notifications drafted &amp; queued
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-green-400">
                <Check size={11} /> Dispatcher in the loop
              </span>
            </motion.div>
          </motion.div>
        </div>

        {/* Prompt input */}
        <div className="border-t border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0a1628] px-3 py-2">
            <Sparkles size={14} className="text-amber-400" />
            <span className="flex-1 text-sm text-blue-300/60">Ask the agent anything about your operations…</span>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-gray-900 transition hover:bg-amber-400"
              aria-label="Send"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function AgentSection() {
  return (
    <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
      {/* Glow orbs */}
      <motion.div
        className="pointer-events-none absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl"
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -left-20 bottom-1/4 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        aria-hidden
      />

      <div className="marketing-container relative">
        {/* Header */}
        <motion.div
          className="mx-auto max-w-3xl text-center"
          variants={headerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          <motion.div variants={headerItem} className="mb-4 inline-block">
            <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              <span className="relative z-10">Fauward Agent — Now Available</span>
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: "-120%" }}
                animate={{ x: "120%" }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                style={{
                  background:
                    "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%, transparent 100%)",
                }}
              />
            </span>
          </motion.div>

          <motion.h2
            variants={headerItem}
            className="text-3xl font-bold leading-tight text-white md:text-4xl lg:text-5xl"
          >
            Delegate operations to an agent that{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 bg-clip-text text-transparent">
                stays in your control
              </span>
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400"
                initial={{ width: 0 }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1, delay: 0.5, ease: EASE }}
              />
            </span>
          </motion.h2>

          <motion.p variants={headerItem} className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-blue-200/90">
            Fauward Agent monitors shipments, flags exceptions, suggests actions, and automates approved workflows — with your dispatchers staying in the loop at every step.
          </motion.p>

          <motion.div variants={headerItem} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <MotionLink
              href="/agent"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-lg bg-amber-500 px-7 text-base font-semibold text-gray-900 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)]"
            >
              <span className="relative z-10 inline-flex items-center gap-2">
                Explore Fauward Agent
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </span>
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-0"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.7, ease: EASE }}
                style={{
                  background:
                    "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)",
                }}
              />
            </MotionLink>
            <MotionLink
              href="/signup"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-7 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/10"
            >
              Start Free Trial
            </MotionLink>
          </motion.div>
        </motion.div>

        {/* Chat mockup */}
        <div className="relative mt-20">
          <ChatMockup />
        </div>

        {/* Capabilities grid */}
        <div className="mt-20 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AGENT_CAPABILITIES.map((cap, i) => {
            const Icon = ICON_MAP[cap.icon] ?? Cpu;
            return (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
                whileHover={{ y: -4 }}
                className="group rounded-xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-amber-500/40 hover:bg-amber-500/[0.06]"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 transition group-hover:bg-amber-500/25">
                  <Icon size={20} />
                </div>
                <h3 className="mb-1.5 text-sm font-bold text-white">{cap.title}</h3>
                <p className="text-xs leading-relaxed text-blue-200/70">{cap.description}</p>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-12 text-center text-xs text-blue-400">
          Available on Pro and Enterprise plans · No extra setup · Works with your existing Fauward account
        </p>
      </div>
    </section>
  );
}
