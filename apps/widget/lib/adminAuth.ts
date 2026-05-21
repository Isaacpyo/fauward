import { getTenantById, validateApiKey } from "@fauward/tenant-db";

export type AuthorizedTenant = {
  id: string;
  slug: string;
};

function hasScope(scopes: string[], requiredScope: "domains:read" | "domains:write") {
  return scopes.includes("*") || scopes.includes(requiredScope);
}

export async function authorizeWidgetDomainAdmin(
  authorization: string | null,
  requiredScope: "domains:read" | "domains:write",
): Promise<AuthorizedTenant | null> {
  const rawKey = authorization?.replace(/^Bearer\s+/i, "");
  if (!rawKey) return null;

  const keyResult = await validateApiKey(rawKey);
  if (!keyResult || !hasScope(keyResult.scopes, requiredScope)) return null;

  const tenant = await getTenantById(keyResult.tenantId);
  if (!tenant) return null;

  return { id: tenant.id, slug: tenant.slug };
}
