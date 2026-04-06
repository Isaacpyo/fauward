"use client";

import { useEffect, useState } from "react";

import { MINI_TESTIMONIALS, TESTIMONIALS } from "@/lib/marketing-data";

const AUTO_ADVANCE_MS = 6000;

function InitialsAvatar({ initials, name }: { initials: string; name: string }) {
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-navy text-base font-bold text-white"
      aria-label={`${name} avatar`}
    >
      {initials}
    </div>
  );
}

export default function TestimonialCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % TESTIMONIALS.length);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, []);

  const active = TESTIMONIALS[index];

  return (
    <section className="bg-gray-50 py-16 lg:py-24">
      <div className="marketing-container">
        <h2 className="text-center text-3xl font-bold text-gray-900 lg:text-4xl">
          What teams say after launching on Fauward
        </h2>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm md:p-10">
          <svg className="mb-4 h-7 w-7 text-amber-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
          </svg>
          <blockquote className="text-xl leading-relaxed text-gray-700">&ldquo;{active.quote}&rdquo;</blockquote>
          <div className="mt-8 flex items-center gap-4">
            {active.avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.avatarSrc}
                alt={`${active.name} avatar`}
                width={56}
                height={56}
                className="h-14 w-14 rounded-full border border-gray-200 object-cover"
              />
            ) : (
              <InitialsAvatar initials={active.initials} name={active.name} />
            )}
            <div>
              <p className="text-base font-semibold text-gray-900">{active.name}</p>
              <p className="text-sm text-gray-600">
                {active.role}, {active.company}
              </p>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center gap-2">
            {TESTIMONIALS.map((testimonial, dotIndex) => (
              <button
                key={testimonial.name}
                type="button"
                onClick={() => setIndex(dotIndex)}
                className={`h-2.5 w-2.5 rounded-full border transition ${
                  dotIndex === index ? "border-brand-navy bg-brand-navy" : "border-gray-300 bg-white"
                }`}
                aria-label={`Show testimonial ${dotIndex + 1}`}
              />
            ))}
          </div>
        </div>

        {MINI_TESTIMONIALS.length > 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {MINI_TESTIMONIALS.map((testimonial) => (
              <div key={testimonial.name} className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-sm leading-relaxed text-gray-700">&ldquo;{testimonial.quote}&rdquo;</p>
                <p className="mt-4 text-xs font-semibold text-gray-500">- {testimonial.name}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
