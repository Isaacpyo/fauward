"use client";

import { useMemo, useState } from "react";

import type { FaqGroup } from "@/lib/marketing-data";

type FAQAccordionProps = {
  groups: FaqGroup[];
};

export default function FAQAccordion({ groups }: FAQAccordionProps) {
  const firstItemId = useMemo(() => `${groups[0]?.topic}-0`, [groups]);
  const [openId, setOpenId] = useState<string>(firstItemId);

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container">
        <h2 className="text-center text-3xl font-semibold text-gray-900">Frequently asked questions</h2>
        <div className="mt-10 space-y-8">
          {groups.map((group) => (
            <div key={group.topic}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">{group.topic}</h3>
              <div className="space-y-3">
                {group.items.map((item, itemIndex) => {
                  const itemId = `${group.topic}-${itemIndex}`;
                  const expanded = openId === itemId;

                  return (
                    <article key={item.question} className="rounded-xl border border-gray-200 bg-white">
                      <button
                        type="button"
                        className="flex min-h-[44px] w-full items-center justify-between gap-4 px-5 py-4 text-left"
                        onClick={() => setOpenId((current) => (current === itemId ? "" : itemId))}
                        aria-expanded={expanded}
                      >
                        <span className="text-base font-semibold text-gray-900">{item.question}</span>
                        <span className="text-xl leading-none text-gray-500" aria-hidden>
                          {expanded ? "−" : "+"}
                        </span>
                      </button>
                      <div
                        className={`grid overflow-hidden px-5 transition-[grid-template-rows,opacity,padding] duration-300 ${
                          expanded ? "grid-rows-[1fr] pb-4 opacity-100" : "grid-rows-[0fr] pb-0 opacity-60"
                        }`}
                      >
                        <p className="min-h-0 overflow-hidden text-base text-gray-600">{item.answer}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
