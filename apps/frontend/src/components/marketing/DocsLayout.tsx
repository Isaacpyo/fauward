"use client";

import { useEffect, useState, type ReactNode } from "react";

export type DocsSection = {
  id: string;
  title: string;
};

type DocsLayoutProps = {
  sections: DocsSection[];
  children: ReactNode;
};

export default function DocsLayout({ sections, children }: DocsLayoutProps) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const sectionElements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (sectionElements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        const nextActive = visibleEntries[0]?.target.id;

        if (nextActive) {
          setActiveSection(nextActive);
        }
      },
      {
        rootMargin: "-120px 0px -55% 0px",
        threshold: [0.15, 0.35, 0.6],
      }
    );

    sectionElements.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [sections]);

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container">
        <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-3 px-3 text-xs font-bold uppercase tracking-widest text-amber-600">
                Documentation
              </p>
              <nav aria-label="Documentation sections" className="space-y-1">
                {sections.map((section) => {
                  const isActive = activeSection === section.id;

                  return (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      onClick={() => setActiveSection(section.id)}
                      className={`block rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        isActive
                          ? "bg-amber-50 text-amber-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      {section.title}
                    </a>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </section>
  );
}
