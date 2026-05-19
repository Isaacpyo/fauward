'use client';

import { useRef, useEffect, useState } from 'react';
import { ClipboardList, UserCheck, Package, Truck, Bell, Camera, FileText, CheckCircle2 } from 'lucide-react';

const STAGES = [
  { icon: ClipboardList, label: 'Booking Created',    actor: 'Dispatcher', time: '08:14',  auto: false },
  { icon: UserCheck,     label: 'Assigned to Driver', actor: 'Dispatcher', time: '08:17',  auto: true  },
  { icon: Package,       label: 'Picked Up',          actor: 'Driver',     time: '09:32',  auto: false },
  { icon: Truck,         label: 'In Transit',         actor: 'Driver',     time: '09:34',  auto: true  },
  { icon: Bell,          label: 'Customer Updated',   actor: 'System',     time: '09:35',  auto: true  },
  { icon: Camera,        label: 'POD Captured',       actor: 'Driver',     time: '13:51',  auto: false },
  { icon: FileText,      label: 'Invoice Generated',  actor: 'System',     time: '13:52',  auto: true  },
  { icon: CheckCircle2,  label: 'Payment Collected',  actor: 'Customer',   time: '14:22',  auto: false },
];

export default function ShipmentLifecycleTimeline() {
  const lineRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    if (lineRef.current) observer.observe(lineRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="bg-white py-20">
      <div className="marketing-container">
        <div className="mx-auto max-w-2xl text-center mb-14">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-amber">
            End-to-end workflow
          </p>
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
            One shipment. Eight steps. Zero manual chasing.
          </h2>
          <p className="mt-4 text-base text-gray-500 leading-relaxed">
            From booking to payment, every step is tracked, automated where approved, and visible to the right people.
          </p>
        </div>

        {/* Desktop horizontal timeline */}
        <div className="hidden lg:block">
          {/* Connector line */}
          <div className="relative mx-8 mb-0 h-0.5 bg-gray-100" ref={lineRef}>
            <div
              className="absolute inset-0 origin-left bg-amber-500 timeline-line"
              data-visible={visible ? 'true' : 'false'}
            />
          </div>

          <div className="grid grid-cols-8 gap-0 -mt-3">
            {STAGES.map(({ icon: Icon, label, actor, time, auto }, i) => (
              <div key={label} className="flex flex-col items-center text-center px-1">
                {/* Circle */}
                <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 z-10 transition-colors duration-500 ${visible ? 'border-amber-500 bg-amber-500' : 'border-gray-200 bg-white'}`}
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                  <Icon size={11} className={visible ? 'text-white' : 'text-gray-300'} />
                </div>

                <div className={`mt-4 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                  style={{ transitionDelay: `${i * 100 + 400}ms` }}
                >
                  <div className="text-xs font-semibold text-gray-800 leading-tight mb-1">{label}</div>
                  <div className="text-xs text-gray-400 mb-1">{actor}</div>
                  <div className="text-xs font-mono text-gray-400">{time}</div>
                  {auto && (
                    <span className="mt-1.5 inline-block rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-xs text-amber-700 font-semibold">
                      AUTO
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile vertical timeline */}
        <div className="lg:hidden space-y-0">
          {STAGES.map(({ icon: Icon, label, actor, time, auto }, i) => (
            <div key={label} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500">
                  <Icon size={14} className="text-white" />
                </div>
                {i < STAGES.length - 1 && <div className="w-0.5 flex-1 bg-amber-200 my-1" />}
              </div>
              <div className="pb-6">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-800">{label}</span>
                  {auto && (
                    <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-xs text-amber-700 font-semibold">
                      AUTO
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{actor} · {time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
