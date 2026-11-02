"use client";

import { useEffect, useRef } from "react";

import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  CONSENT_EVENT,
  CONSENT_STORAGE_KEY,
  serializeTouch,
  touchFromLocation,
  type AttributionTouch
} from "@/lib/attribution";

function hasCookie(name: string) {
  return document.cookie.split("; ").some((entry) => entry.startsWith(`${name}=`));
}

function consented() {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === "accepted";
  } catch {
    return false;
  }
}

/**
 * Remembers this tab's first page view and, once the visitor has accepted non-essential cookies, stores it as the
 * first-touch cookie (never overwriting an earlier one). Renders nothing.
 */
export default function AttributionCapture() {
  const firstTouch = useRef<AttributionTouch | null>(null);

  useEffect(() => {
    firstTouch.current = touchFromLocation(window.location.href, document.referrer, new Date());
    const store = () => {
      if (!firstTouch.current || !consented() || hasCookie(ATTRIBUTION_COOKIE)) return;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${ATTRIBUTION_COOKIE}=${serializeTouch(firstTouch.current)}; Max-Age=${ATTRIBUTION_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
    };
    store();
    window.addEventListener(CONSENT_EVENT, store);
    return () => window.removeEventListener(CONSENT_EVENT, store);
  }, []);

  return null;
}
