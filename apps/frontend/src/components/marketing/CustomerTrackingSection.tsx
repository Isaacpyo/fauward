import Link from 'next/link';
import { Link2, Clock, CheckCircle2, Camera, MessageSquare, Shield, Check } from 'lucide-react';

const FEATURES = [
  { icon: Link2,       text: 'Branded tracking link — no app download, no login' },
  { icon: Clock,       text: 'Live shipment status and estimated delivery window' },
  { icon: CheckCircle2,text: 'Proof of delivery photo and signature confirmation' },
  { icon: MessageSquare,text: 'Two-way support relay — customers can send messages' },
  { icon: Shield,      text: 'Fully white-labelled under your brand and domain' },
  { icon: Camera,      text: 'Photo proof of delivery visible to the customer' },
];

const TIMELINE_STEPS = [
  { label: 'Booked',        done: true  },
  { label: 'Collected',     done: true  },
  { label: 'In Transit',    done: true  },
  { label: 'Out for Delivery', done: false, active: true },
  { label: 'Delivered',     done: false },
];

export default function CustomerTrackingSection() {
  return (
    <section className="bg-gray-50 py-20">
      <div className="marketing-container">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">

          {/* Tracking UI mockup */}
          <div className="order-2 lg:order-1">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden max-w-sm mx-auto lg:mx-0">
              {/* Branded tenant header */}
              <div className="bg-brand-navy px-5 py-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-md bg-amber-500 flex items-center justify-center">
                  <span className="text-xs font-bold text-white">NS</span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Northline Logistics</div>
                  <div className="text-xs text-blue-300">Track your shipment</div>
                </div>
              </div>

              <div className="p-5">
                {/* Reference + status */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Reference</div>
                    <div className="font-mono text-sm font-semibold text-gray-800">FW-2024-7821</div>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                    Out for Delivery
                  </span>
                </div>

                {/* ETA */}
                <div className="mb-5 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-center">
                  <div className="text-xs text-amber-600 mb-0.5">Estimated delivery</div>
                  <div className="text-sm font-bold text-amber-800">Today, 2:30 – 4:00 PM</div>
                </div>

                {/* Timeline */}
                <div className="mb-5">
                  {TIMELINE_STEPS.map(({ label, done, active }, i) => (
                    <div key={label} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          done ? 'border-green-500 bg-green-500' : active ? 'border-blue-500 bg-blue-500' : 'border-gray-200 bg-white'
                        }`}>
                          {(done || active) && <CheckCircle2 size={10} className="text-white" />}
                        </div>
                        {i < TIMELINE_STEPS.length - 1 && (
                          <div className={`w-0.5 h-4 ${done ? 'bg-green-300' : 'bg-gray-100'}`} />
                        )}
                      </div>
                      <div className="pb-2">
                        <span className={`text-xs font-semibold ${done ? 'text-green-700' : active ? 'text-blue-700' : 'text-gray-400'}`}>
                          {label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Map placeholder */}
                <div className="mb-4 h-24 rounded-lg bg-grid border border-gray-200 flex items-center justify-center">
                  <span className="text-xs text-gray-400">Route map</span>
                </div>

                {/* Support */}
                <button className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
                  <MessageSquare size={12} />
                  Send us a message
                </button>
              </div>
            </div>
          </div>

          {/* Copy */}
          <div className="order-1 lg:order-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-amber">
              Customer Tracking
            </p>
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl leading-tight">
              Give customers tracking,
              <br />
              not phone calls.
            </h2>
            <p className="mt-5 text-base text-gray-500 leading-relaxed">
              Every shipment gets a branded tracking link. Customers see live status, ETA, and proof of delivery — without calling your team or downloading an app.
            </p>

            <ul className="mt-7 space-y-3">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-50 border border-amber-100">
                    <Icon size={12} className="text-amber-600" />
                  </div>
                  <span className="text-sm text-gray-600">{text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/customer-tracking"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                See how it works
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-6 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Start free trial
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
