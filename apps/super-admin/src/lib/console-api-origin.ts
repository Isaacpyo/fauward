// Where the console API lives (WP-5.4 follow-up). On admin.fauward.com the console calls api.fauward.com directly, so
// Cloudflare sees each staff member's own address: login records, IP blocks and the failed-login auto-block act on that
// address, not on the Vercel proxy every console request used to share. Previews and local dev keep the same-origin
// /api/internal proxy (vercel.json rewrite, Vite dev proxy). VITE_CONSOLE_API_ORIGIN overrides both.
export const PRODUCTION_CONSOLE_HOST = "admin.fauward.com";
export const PRODUCTION_API_ORIGIN = "https://api.fauward.com";

export function consoleApiOrigin(hostname: string | undefined, override?: string): string {
  if (override) return override.replace(/\/$/, "");
  return hostname === PRODUCTION_CONSOLE_HOST ? PRODUCTION_API_ORIGIN : "";
}

const origin = consoleApiOrigin(
  typeof window === "undefined" ? undefined : window.location.hostname,
  import.meta.env.VITE_CONSOLE_API_ORIGIN as string | undefined
);

/** Base URL of every console endpoint (D2: all of them are under /api/internal). */
export const CONSOLE_API_BASE = `${origin}/api/internal`;

/** Absolute URL for a console endpoint path such as `/activity/stream` (links, downloads, EventSource). */
export function consoleApiUrl(path: string): string {
  return `${CONSOLE_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
