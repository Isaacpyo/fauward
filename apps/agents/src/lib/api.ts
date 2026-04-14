import { buildSession, clearSession, loadSession, saveSession, type AgentSession } from "@/lib/session";

const API_PREFIX = "/api/v1";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function withPrefix(path: string): string {
  if (path.startsWith("/api/")) return path;
  return `${API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }
  if (response.status === 204) {
    return null;
  }
  return response.text().catch(() => null);
}

function toMessage(data: unknown, fallback: string): string {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    const candidate = (data as { error?: string; message?: string }).error ?? (data as { message?: string }).message;
    if (candidate) return candidate;
  }
  return fallback;
}

async function refreshAccessToken(session: AgentSession): Promise<AgentSession | null> {
  const response = await fetch(withPrefix("/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });

  const data = (await parseBody(response)) as
    | {
        accessToken?: string;
        refreshToken?: string;
        tenantSlug?: string;
        tenantId?: string;
      }
    | null;

  if (!response.ok || !data?.accessToken || !data.refreshToken || !data.tenantSlug || !data.tenantId) {
    return null;
  }

  const next = buildSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    tenantSlug: data.tenantSlug,
    tenantId: data.tenantId
  });

  if (!next) {
    return null;
  }

  saveSession(next);
  return next;
}

export async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!(init.body instanceof FormData) && init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(withPrefix(path), {
    ...init,
    headers
  });

  const data = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(toMessage(data, "Request failed"), response.status, data);
  }

  return data as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const session = loadSession();
  if (!session) {
    throw new ApiError("Unauthorized", 401);
  }

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  headers.set("x-tenant-slug", session.tenantSlug);
  if (!(init.body instanceof FormData) && init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(withPrefix(path), {
    ...init,
    headers
  });

  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessToken(session);
    if (refreshed) {
      return apiRequest<T>(path, init, false);
    }
    clearSession();
    throw new ApiError("Session expired", 401);
  }

  const data = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(toMessage(data, "Request failed"), response.status, data);
  }

  return data as T;
}