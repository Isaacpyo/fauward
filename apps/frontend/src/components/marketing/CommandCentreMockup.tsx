'use client';

import { AlertTriangle, CheckCircle2, Package, Users, TrendingUp, Zap, Bell, FileText } from 'lucide-react';

const SHIPMENTS = [
  { ref: 'FW-7821', status: 'AT RISK',    pillClass: 'pill-risk',     driver: 'M. Osei',    eta: '14:10', notified: false },
  { ref: 'FW-7819', status: 'IN TRANSIT', pillClass: 'pill-transit',  driver: 'A. Hassan',  eta: '14:45', notified: true  },
  { ref: 'FW-7815', status: 'POD',        pillClass: 'pill-pod',      driver: 'S. Patel',   eta: '—',     notified: true  },
  { ref: 'FW-7810', status: 'ASSIGNED',   pillClass: 'pill-assigned', driver: 'L. Nwosu',   eta: '15:30', notified: false },
  { ref: 'FW-7808', status: 'DELIVERED',  pillClass: 'pill-delivered',driver: 'K. James',   eta: '—',     notified: true  },
];

const FEED = [
  { icon: Bell,       text: 'Customer notified — FW-7819', color: 'text-blue-400',  dot: 'bg-blue-500'  },
  { icon: CheckCircle2, text: 'POD captured — FW-7815',   color: 'text-green-400', dot: 'bg-green-500' },
  { icon: FileText,   text: 'Invoice generated — FW-7815', color: 'text-amber-400', dot: 'bg-amber-500' },
];

export function CommandCentreMockup() {
  return (
    <div
      className="relative rounded-xl overflow-hidden border border-dark-border shadow-2xl transition-transform duration-500 ease-out hover:scale-[1.03]"
      style={{ background: '#0a1628' }}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border" style={{ background: '#070f1f' }}>
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-70" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 opacity-70" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-70" />
        <div className="flex-1 mx-4 px-3 py-1 rounded-md text-xs text-gray-500 font-mono border border-dark-border" style={{ background: '#0a1628' }}>
          portal.yourbrand.com
        </div>
        <div className="flex items-center gap-1.5">
          <span className="live-dot w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-green-400 font-mono">LIVE</span>
        </div>
      </div>

      <div className="flex" style={{ minHeight: 340 }}>
        {/* Main panel */}
        <div className="flex-1 p-4 flex flex-col gap-3">
          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Package,    label: 'Shipments Today', value: '47',     color: 'text-blue-400'  },
              { icon: Users,      label: 'Active Drivers',  value: '12',     color: 'text-amber-400' },
              { icon: TrendingUp, label: 'MTD Revenue',     value: '£18,240',color: 'text-green-400' },
              { icon: Zap,        label: 'SLA Score',       value: '94%',    color: 'text-purple-400'},
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="rounded-lg p-2.5 border border-dark-border" style={{ background: '#0f1f38' }}>
                <Icon size={12} className={`mb-1 ${color}`} />
                <div className={`text-base font-semibold font-mono ${color}`}>{value}</div>
                <div className="text-xs text-gray-500 leading-tight">{label}</div>
              </div>
            ))}
          </div>

          {/* Shipments table */}
          <div className="rounded-lg border border-dark-border overflow-hidden" style={{ background: '#0f1f38' }}>
            <div className="grid grid-cols-5 px-3 py-1.5 text-xs text-gray-500 border-b border-dark-border font-mono uppercase tracking-wider">
              <span>Ref</span>
              <span>Status</span>
              <span>Driver</span>
              <span>ETA</span>
              <span className="text-center">Notif.</span>
            </div>
            {SHIPMENTS.map((s) => (
              <div key={s.ref} className="grid grid-cols-5 px-3 py-2 text-xs border-b border-dark-border last:border-0 items-center hover:bg-dark-elevated transition-colors">
                <span className="font-mono text-gray-300">{s.ref}</span>
                <span>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-semibold ${s.pillClass}`}>
                    {s.status}
                  </span>
                </span>
                <span className="text-gray-400">{s.driver}</span>
                <span className="text-gray-400 font-mono">{s.eta}</span>
                <span className="text-center">
                  {s.notified
                    ? <CheckCircle2 size={12} className="text-green-400 mx-auto" />
                    : <span className="text-gray-600 mx-auto block text-center">—</span>
                  }
                </span>
              </div>
            ))}
          </div>

          {/* Agent bar */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-900/50" style={{ background: 'rgba(217,119,6,0.08)' }}>
            <AlertTriangle size={12} className="text-amber-400 shrink-0" />
            <span className="text-xs text-amber-300 font-mono">Agent flagged 2 SLA risks · 1 action pending</span>
            <button className="ml-auto text-xs text-amber-500 hover:text-amber-300 transition-colors font-mono shrink-0">
              Review →
            </button>
          </div>
        </div>

        {/* Right feed */}
        <div className="w-40 border-l border-dark-border p-3 flex flex-col gap-2 shrink-0 hidden sm:flex">
          <div className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-1">Live Events</div>
          {FEED.map(({ icon: Icon, text, color, dot }, i) => (
            <div key={i} className={`t-line t-line-${i} flex items-start gap-2`}>
              <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
              <div>
                <Icon size={10} className={`mb-0.5 ${color}`} />
                <p className="text-xs text-gray-400 leading-snug">{text}</p>
              </div>
            </div>
          ))}
          <div className="mt-auto pt-2 border-t border-dark-border">
            <div className="text-xs text-gray-600 font-mono">Updated 3s ago</div>
          </div>
        </div>
      </div>
    </div>
  );
}
