/**
 * Extracts the tenant slug from the current hostname at runtime.
 *
 * - acme.fauward.com   → "acme"
 * - localhost           → falls back to VITE_DEV_TENANT_SLUG env var or "demo"
 * - 127.0.0.1          → same fallback
 * - app.fauward.com    → returns null (top-level platform, no tenant)
 */

const PLATFORM_HOSTS = new Set(["fauward.com", "www.fauward.com", "app.fauward.com"]);
const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);
const FAUWARD_APEX = "fauward.com";

export function resolveSubdomainSlug(): string | null {
  const hostname = window.location.hostname.toLowerCase();

  if (DEV_HOSTS.has(hostname)) {
    return import.meta.env.VITE_DEV_TENANT_SLUG ?? "demo";
  }

  if (PLATFORM_HOSTS.has(hostname)) {
    return null;
  }

  if (hostname.endsWith(`.${FAUWARD_APEX}`)) {
    const sub = hostname.slice(0, hostname.length - FAUWARD_APEX.length - 1);
    // Reject multi-level subdomains (e.g. a.b.fauward.com)
    if (sub && !sub.includes(".")) return sub;
  }

  return null;
}

/**
 * Validates that a proposed slug meets platform rules:
 * - 3–48 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug);
}

/**
 * Returns the full tenant subdomain URL for a given slug.
 */
export function tenantUrl(slug: string): string {
  const base = import.meta.env.VITE_PLATFORM_URL ?? "https://fauward.com";
  // In dev, just return the local URL
  if (slug === "demo" && import.meta.env.DEV) return window.location.origin;
  return `https://${slug}.${FAUWARD_APEX}`;
}
