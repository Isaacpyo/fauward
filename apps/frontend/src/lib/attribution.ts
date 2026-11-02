// gtm.attribution (WP-4.16): first-touch attribution for fauward.com. The touch (utm_*, external referrer, landing page,
// first seen) is written to the first-party cookie `fw_attr` only after the visitor accepts non-essential cookies (the
// cookie policy lists traffic-source measurement as consent-based). The signup API route reads the cookie and forwards
// it to the backend, which stores one FIRST_TOUCH row for the new tenant.

export const ATTRIBUTION_COOKIE = "fw_attr";
export const ATTRIBUTION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
export const CONSENT_STORAGE_KEY = "fauward_cookie_consent";
export const CONSENT_EVENT = "fauward:cookie-consent";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const MAX_FIELD = 200;

export type AttributionTouch = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landingPage: string;
  firstSeen: string;
};

function clip(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, MAX_FIELD) : undefined;
}

/** The touch for a page view: its UTM parameters, an external referrer (own-site referrers are dropped) and the path. */
export function touchFromLocation(href: string, referrer: string, now: Date): AttributionTouch {
  const url = new URL(href);
  const touch: AttributionTouch = { landingPage: url.pathname.slice(0, MAX_FIELD), firstSeen: now.toISOString() };
  for (const key of UTM_KEYS) {
    const value = clip(url.searchParams.get(key));
    if (value) touch[key] = value;
  }
  if (referrer) {
    try {
      const from = new URL(referrer);
      if (from.host !== url.host) touch.referrer = clip(from.origin + from.pathname);
    } catch {
      // A malformed referrer header is ignored.
    }
  }
  return touch;
}

export function serializeTouch(touch: AttributionTouch) {
  return encodeURIComponent(JSON.stringify(touch));
}

/** Parses the cookie value; anything that is not a well-formed touch is ignored. */
export function parseTouch(raw: string | undefined | null): AttributionTouch | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (typeof value.landingPage !== "string" || typeof value.firstSeen !== "string") return null;
    const touch: AttributionTouch = { landingPage: value.landingPage.slice(0, MAX_FIELD), firstSeen: value.firstSeen };
    for (const key of [...UTM_KEYS, "referrer"] as const) {
      const field = value[key];
      if (typeof field === "string" && field.trim()) touch[key] = field.trim().slice(0, MAX_FIELD);
    }
    return touch;
  } catch {
    return null;
  }
}
