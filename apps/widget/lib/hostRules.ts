import { normalizeHost } from "./resolveTenantByHost";

const PLATFORM_HOSTS = new Set(["fauward.com", "www.fauward.com"]);

export const SHIP_HOST = "ship.fauward.com";

export function isLocalhost(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function isVercelPreviewHost(host: string) {
  return host === "vercel.app" || host.endsWith(".vercel.app");
}

export function isPlatformHost(host: string | null | undefined) {
  const normalized = normalizeHost(host);
  return PLATFORM_HOSTS.has(normalized) || isLocalhost(normalized) || isVercelPreviewHost(normalized);
}

export function isShipHost(host: string | null | undefined) {
  return normalizeHost(host) === SHIP_HOST;
}

export function isPortalOwnedFauwardHost(host: string | null | undefined) {
  const normalized = normalizeHost(host);
  return normalized === "app.fauward.com" || normalized.endsWith(".fauward.com");
}
