"use client";

import { useState } from "react";

import { SCREENSHOT_SHOWCASE_ITEMS } from "@/lib/marketing-data";

function BrowserChrome({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
      <span className="h-3 w-3 rounded-full bg-red-400" />
      <span className="h-3 w-3 rounded-full bg-yellow-400" />
      <span className="h-3 w-3 rounded-full bg-green-400" />
      <div className="mx-3 flex h-6 flex-1 items-center rounded border border-gray-300 bg-white px-3 text-xs text-gray-500">
        app.fauward.com — {title.toLowerCase()}
      </div>
    </div>
  );
}

function ShipmentOpsMockup() {
  const rows = [
    { id: "FW-10482", route: "London → Manchester", driver: "James O.", status: "In Transit", statusColor: "bg-amber-100 text-amber-700" },
    { id: "FW-10481", route: "Lagos → Abuja", driver: "Emeka A.", status: "Delivered", statusColor: "bg-green-100 text-green-700" },
    { id: "FW-10480", route: "Dubai → Abu Dhabi", driver: "Sara M.", status: "Pending", statusColor: "bg-gray-100 text-gray-600" },
    { id: "FW-10479", route: "Birmingham → Leeds", driver: "Tom R.", status: "In Transit", statusColor: "bg-amber-100 text-amber-700" },
    { id: "FW-10478", route: "Nairobi → Mombasa", driver: "Wanjiru K.", status: "Delivered", statusColor: "bg-green-100 text-green-700" },
  ];
  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-4 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <span>ID</span><span>Route</span><span>Driver</span><span>Status</span>
        </div>
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-4 items-center border-b border-gray-50 px-4 py-3 text-sm last:border-0">
            <span className="font-mono font-medium text-gray-700">{row.id}</span>
            <span className="text-gray-600">{row.route}</span>
            <span className="text-gray-600">{row.driver}</span>
            <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.statusColor}`}>{row.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomerTrackingMockup() {
  return (
    <>
      <style>{`
        @keyframes ping-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.6); }
        }
        .pin-pulse { animation: ping-slow 1.5s ease-in-out infinite; }
      `}</style>
      <div className="flex aspect-[16/9] flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-8">
        <div className="relative mb-6 flex h-40 w-64 items-center justify-center rounded-xl border border-blue-200 bg-white shadow-sm">
          <div className="absolute inset-0 overflow-hidden rounded-xl opacity-30">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="absolute border border-blue-200" style={{ inset: `${i * 12}px` }} />
            ))}
          </div>
          <div className="relative flex flex-col items-center gap-2">
            <div className="relative">
              <div className="pin-pulse absolute inset-0 rounded-full bg-amber-400 opacity-50" />
              <div className="relative h-5 w-5 rounded-full bg-amber-500 ring-2 ring-white shadow" />
            </div>
            <span className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white shadow">Live tracking</span>
          </div>
        </div>
        <div className="w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shipment FW-10482</p>
          <p className="mt-1 font-semibold text-gray-900">London → Manchester</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-sm text-gray-600">ETA: 2h 15min · Driver: James O.</span>
          </div>
        </div>
      </div>
    </>
  );
}

function InvoicingMockup() {
  return (
    <div className="flex aspect-[16/9] flex-col items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Invoice</p>
            <p className="text-lg font-bold text-gray-900">#INV-2024-0091</p>
          </div>
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Paid</span>
        </div>
        <div className="mt-4 space-y-2 text-sm text-gray-600">
          <div className="flex justify-between"><span>Shipment ops (Oct)</span><span className="font-semibold">£1,240.00</span></div>
          <div className="flex justify-between"><span>VAT (20%)</span><span>£248.00</span></div>
          <div className="flex justify-between border-t border-gray-100 pt-2 font-bold text-gray-900"><span>Total</span><span>£1,488.00</span></div>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
          <span>Due: 15 Nov 2024</span>
          <span>Acme Logistics Ltd</span>
        </div>
      </div>
    </div>
  );
}

const MOCKUP_MAP: Record<string, React.ReactNode> = {
  "Shipment ops": <ShipmentOpsMockup />,
  "Customer tracking": <CustomerTrackingMockup />,
  "Invoicing": <InvoicingMockup />,
};

export default function ScreenshotShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const active = SCREENSHOT_SHOWCASE_ITEMS[activeIndex];

  function handleTabClick(index: number) {
    if (index === activeIndex) return;
    setVisible(false);
    setTimeout(() => {
      setActiveIndex(index);
      setVisible(true);
    }, 200);
  }

  return (
    <section className="bg-gray-50 py-16 lg:py-24">
      <div className="marketing-container">
        <h2 className="text-center text-3xl font-bold text-gray-900 lg:text-4xl">
          A closer look at the tenant portal
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
          Operations, tracking, and billing screens designed to keep your team and customers aligned.
        </p>

        <div className="mt-10 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <BrowserChrome title={active.title} />
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-base font-semibold text-gray-900">{active.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{active.description}</p>
          </div>
          <div
            className="transition-opacity duration-300"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {MOCKUP_MAP[active.title] ?? (
              <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
                <p className="text-sm text-gray-400">{active.title}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {SCREENSHOT_SHOWCASE_ITEMS.map((item, index) => (
            <button
              key={item.title}
              type="button"
              onClick={() => handleTabClick(index)}
              className={`overflow-hidden rounded-xl border bg-white text-left transition ${
                index === activeIndex
                  ? "border-brand-navy ring-1 ring-brand-navy"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-red-300" />
                <span className="h-2 w-2 rounded-full bg-yellow-300" />
                <span className="h-2 w-2 rounded-full bg-green-300" />
              </div>
              <div className="flex h-28 items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
                <p className="text-xs font-medium text-gray-400">{item.title}</p>
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
