import { get } from "@vercel/edge-config";

type DomainsValue = Record<string, unknown>;

function isRecord(value: unknown): value is DomainsValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeHost(host: string | null | undefined): string {
  const raw = (host ?? "").trim().toLowerCase();
  if (!raw) return "";

  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end >= 0 ? raw.slice(0, end + 1) : raw;
  }

  return raw.split(":")[0] ?? "";
}

export async function resolveTenantByHost(host: string | null | undefined): Promise<string | null> {
  const normalized = normalizeHost(host);
  if (!normalized) return null;

  try {
    const domains = await get("domains");
    if (!isRecord(domains)) return null;

    const slug = domains[normalized];
    return typeof slug === "string" && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}
