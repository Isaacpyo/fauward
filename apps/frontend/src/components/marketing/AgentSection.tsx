import Link from "next/link";
import { AGENT_CAPABILITIES } from "@/lib/marketing-data";
import { Cpu, AlertTriangle, MessageSquare, TrendingUp, Bell, Link2 } from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  cpu: Cpu,
  "alert-triangle": AlertTriangle,
  "message-square": MessageSquare,
  "trending-up": TrendingUp,
  bell: Bell,
  link: Link2,
};

const terminalLines = [
  { prefix: "agent", color: "text-amber-400", text: "Scanning 847 active shipments…" },
  { prefix: "alert", color: "text-red-400", text: "SLA breach risk detected — FW-10503 (Dubai → Riyadh)" },
  { prefix: "action", color: "text-green-400", text: "Re-routing to Carrier B — ETA recalculated to 14:30" },
  { prefix: "notify", color: "text-blue-400", text: "Customer notified automatically via SMS + email" },
  { prefix: "agent", color: "text-amber-400", text: "Assigning 12 new shipments to optimal drivers…" },
  { prefix: "done", color: "text-green-400", text: "All SLA targets on track ✓" },
];

export default function AgentSection() {
  return (
    <>
      <style>{`
        @keyframes type-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .type-cursor { animation: type-cursor 1s step-end infinite; }
        @keyframes terminal-line {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .t-line-0 { animation: terminal-line 0.3s ease-out 0.2s both; }
        .t-line-1 { animation: terminal-line 0.3s ease-out 0.7s both; }
        .t-line-2 { animation: terminal-line 0.3s ease-out 1.2s both; }
        .t-line-3 { animation: terminal-line 0.3s ease-out 1.7s both; }
        .t-line-4 { animation: terminal-line 0.3s ease-out 2.2s both; }
        .t-line-5 { animation: terminal-line 0.3s ease-out 2.7s both; }
      `}</style>
      <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
        {/* Background grid */}
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        {/* Glow orbs */}
        <div className="pointer-events-none absolute -right-32 top-1/4 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-16 bottom-1/4 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" aria-hidden />

        <div className="marketing-container relative">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-400">
              <span className="relative flex h-2 w-2">
                <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              New — Fauward Agent
            </p>
            <h2 className="text-3xl font-bold leading-tight text-white lg:text-4xl xl:text-5xl">
              Your operations — on{" "}
              <span className="gradient-text">autopilot</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-blue-200">
              Fauward Agent monitors every shipment in real time, re-routes exceptions before SLAs breach, and handles driver assignment — all without a human in the loop.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/agent"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-amber-600 px-7 text-base font-semibold text-white transition hover:bg-amber-700"
              >
                Explore Fauward Agent
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-12 items-center rounded-lg border border-white/20 px-7 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Start Free Trial
              </Link>
            </div>
          </div>

          {/* Terminal mockup + capabilities grid */}
          <div className="mt-16 grid gap-8 lg:grid-cols-2 lg:items-start">
            {/* Terminal */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#060e1c] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-red-500/70" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
                <span className="h-3 w-3 rounded-full bg-green-500/70" />
                <span className="ml-3 text-xs font-medium text-blue-300">fauward-agent — live ops</span>
              </div>
              <div className="space-y-2 p-5 font-mono text-sm">
                {terminalLines.map((line, i) => (
                  <div key={i} className={`t-line-${i} flex gap-2`}>
                    <span className={`shrink-0 font-bold ${line.color}`}>[{line.prefix}]</span>
                    <span className="text-blue-100">{line.text}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <span className="font-bold text-amber-400">[agent]</span>
                  <span className="text-blue-300">_</span>
                  <span className="type-cursor font-bold text-amber-400">|</span>
                </div>
              </div>
            </div>

            {/* Capabilities */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {AGENT_CAPABILITIES.map((cap) => {
                const Icon = ICON_MAP[cap.icon] ?? Cpu;
                return (
                  <div
                    key={cap.title}
                    className="group rounded-xl border border-white/10 bg-white/5 p-5 transition hover:border-amber-500/30 hover:bg-amber-500/5"
                  >
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                      <Icon size={20} />
                    </div>
                    <h3 className="mb-1.5 text-sm font-bold text-white">{cap.title}</h3>
                    <p className="text-xs leading-relaxed text-blue-300">{cap.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom tag */}
          <p className="mt-10 text-center text-xs text-blue-400">
            Available on Pro and Enterprise plans · No extra setup · Works with your existing Fauward account
          </p>
        </div>
      </section>
    </>
  );
}
