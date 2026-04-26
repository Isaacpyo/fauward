/**
 * Called once at app boot (before React renders).
 * Extracts the tenant slug from the subdomain and stores it in localStorage
 * so api.ts can inject it as X-Tenant-Slug on every request.
 *
 * If a slug is already stored (from a previous login), it is preserved unless
 * the subdomain differs — in that case the subdomain wins (user navigated to
 * a different tenant's portal).
 */
import { resolveSubdomainSlug } from "./tenantResolver";
import { getTenantSlug, setTokens, getAccessToken, getRefreshToken } from "./auth";

export function initTenantSlug(): void {
  const subdomainSlug = resolveSubdomainSlug();
  const storedSlug = getTenantSlug();

  if (!subdomainSlug) return; // On platform root — no-op

  if (subdomainSlug !== storedSlug) {
    // Different tenant from the one in storage — update the slug.
    // Preserve existing tokens if any; they'll fail with 401 if wrong tenant
    // and the refresh flow will clear them.
    const accessToken = getAccessToken() ?? "";
    const refreshToken = getRefreshToken() ?? "";
    setTokens(accessToken, refreshToken, subdomainSlug);
  }
}
