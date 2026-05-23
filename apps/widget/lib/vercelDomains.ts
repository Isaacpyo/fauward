export const CNAME_TARGET = "cname.vercel-dns.com";

type VercelVerificationChallenge = {
  type: string;
  domain: string;
  value: string;
  reason?: string;
};

export type VercelProjectDomain = {
  name: string;
  apexName?: string;
  projectId?: string;
  verified: boolean;
  verification?: VercelVerificationChallenge[];
};

type VercelDomainConfig = {
  misconfigured?: boolean;
};

export type DomainStatus = {
  verified: boolean;
  misconfigured: boolean;
  verification: VercelVerificationChallenge[];
};

class VercelApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "VercelApiError";
  }
}

function requireEnv(key: "VERCEL_TOKEN" | "VERCEL_PROJECT_ID") {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required for widget domain provisioning`);
  }
  return value;
}

function endpoint(pathname: string) {
  return `https://api.vercel.com${pathname}`;
}

async function parseJson(response: Response): Promise<unknown> {
  return response.status === 204 ? null : response.json().catch(() => null);
}

function errorMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return fallback;
}

async function vercelFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint(pathname), {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("VERCEL_TOKEN")}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = await parseJson(response);
  if (!response.ok) {
    throw new VercelApiError(errorMessage(body, response.statusText), response.status);
  }

  return body as T;
}

async function getProjectDomain(domain: string): Promise<VercelProjectDomain> {
  const projectId = encodeURIComponent(requireEnv("VERCEL_PROJECT_ID"));
  return vercelFetch<VercelProjectDomain>(
    `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`,
  );
}

export async function addDomainToProject(domain: string): Promise<VercelProjectDomain> {
  const projectId = encodeURIComponent(requireEnv("VERCEL_PROJECT_ID"));
  try {
    return await vercelFetch<VercelProjectDomain>(`/v10/projects/${projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });
  } catch (error) {
    if (error instanceof VercelApiError && error.status === 409) {
      return getProjectDomain(domain);
    }
    throw error;
  }
}

export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const projectDomain = await getProjectDomain(domain);
  const config = await vercelFetch<VercelDomainConfig>(
    `/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${encodeURIComponent(requireEnv("VERCEL_PROJECT_ID"))}`,
  );

  return {
    verified: projectDomain.verified,
    misconfigured: config.misconfigured === true,
    verification: projectDomain.verification ?? [],
  };
}

export async function removeDomainFromProject(domain: string): Promise<void> {
  const projectId = encodeURIComponent(requireEnv("VERCEL_PROJECT_ID"));
  try {
    await vercelFetch<unknown>(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error instanceof VercelApiError && error.status === 404) return;
    throw error;
  }
}
