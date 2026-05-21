type EdgeConfigItem = {
  key: string;
  value: unknown;
};

type DomainsMap = Record<string, string>;

function requireEnv(key: "VERCEL_TOKEN" | "EDGE_CONFIG_ID") {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required for widget Edge Config administration`);
  }
  return value;
}

function isDomainsMap(value: unknown): value is DomainsMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

async function edgeConfigFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.vercel.com/v1/edge-config/${requireEnv("EDGE_CONFIG_ID")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("VERCEL_TOKEN")}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Edge Config request failed with ${response.status}`);
  }
  return body as T;
}

async function readDomains(): Promise<DomainsMap> {
  const items = await edgeConfigFetch<EdgeConfigItem[]>("/items");
  const domains = items.find((item) => item.key === "domains")?.value;
  return isDomainsMap(domains) ? domains : {};
}

async function writeDomains(domains: DomainsMap) {
  await edgeConfigFetch<{ status: string }>("/items", {
    method: "PATCH",
    body: JSON.stringify({
      items: [{ operation: "upsert", key: "domains", value: domains }],
    }),
  });
}

export async function mapDomainToTenant(host: string, slug: string): Promise<void> {
  const domains = await readDomains();
  await writeDomains({ ...domains, [host]: slug });
}

export async function unmapDomain(host: string): Promise<void> {
  const domains = await readDomains();
  const next = { ...domains };
  delete next[host];
  await writeDomains(next);
}
