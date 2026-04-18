"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

const STORAGE_KEY = "fauward_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      // localStorage unavailable (SSR or blocked)
    }
  }, []);

  function accept() {
    try { localStorage.setItem(STORAGE_KEY, "accepted"); } catch { /* noop */ }
    setVisible(false);
  }

  function decline() {
    try { localStorage.setItem(STORAGE_KEY, "declined"); } catch { /* noop */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-300/40 sm:left-6 sm:right-auto sm:w-[480px]"
    >
      <div className="p-5">
        <p className="text-sm font-semibold text-gray-900">We use cookies 🍪</p>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
          We use essential cookies to keep the platform running and optional analytics cookies to understand how it&apos;s used — no ad tracking, no fingerprinting.{" "}
          <Link href="/legal/cookies" className="underline hover:text-amber-700">Cookie policy</Link>
          {" · "}
          <Link href="/legal/privacy" className="underline hover:text-amber-700">Privacy policy</Link>
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={accept}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-600 px-5 text-xs font-semibold text-white transition hover:bg-amber-700"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={decline}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 px-5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Essential only
          </button>
        </div>
      </div>
    </div>
  );
}
