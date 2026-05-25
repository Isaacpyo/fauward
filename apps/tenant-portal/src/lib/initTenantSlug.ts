/**
 * Called once at app boot before React renders.
 * Resolves the tenant slug from /t/:slug first, then from the subdomain, and
 * stores it so api.ts can inject X-Tenant-Slug on every request.
 */
import { resolvePathTenantSlug, resolveSubdomainSlug } from "./tenantResolver";
import { getAccessToken, getTenantSlug, setTenantSlug } from "./auth";

export function initTenantSlug(): void {
  // If the user has a real JWT session, their slug was set at login — don't override it.
  if (getAccessToken()) return;

  const resolvedSlug = resolvePathTenantSlug() ?? resolveSubdomainSlug();
  const storedSlug = getTenantSlug();

  if (!resolvedSlug) return;

  if (resolvedSlug !== storedSlug) {
    setTenantSlug(resolvedSlug);
  }
}
