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

function ScreenshotPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex aspect-[16/9] w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-8 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-brand-navy/10">
        <svg className="h-7 w-7 text-brand-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" />
        </svg>
      </div>
      <p className="text-lg font-semibold text-brand-navy">{title}</p>
      <p className="mt-2 max-w-xs text-sm text-gray-500">{description}</p>
      <span className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
        Screenshot coming soon
      </span>
    </div>
  );
}

export default function ScreenshotShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = SCREENSHOT_SHOWCASE_ITEMS[activeIndex];

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
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">{active.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{active.description}</p>
          </div>
          <ScreenshotPlaceholder title={active.title} description={active.description} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {SCREENSHOT_SHOWCASE_ITEMS.map((item, index) => (
            <button
              key={item.title}
              type="button"
              onClick={() => setActiveIndex(index)}
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
