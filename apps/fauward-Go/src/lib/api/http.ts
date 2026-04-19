import { appEnv } from "@/lib/config/env";

const TENANT_SLUG_STORAGE_KEY = "fauward-go-tenant-slug";

export class ApiError extends Error {
  status: number;

  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type ApiRequestInit = Omit<RequestInit, "body" | "headers"> & {
  token?: string;
  body?: unknown;
  headers?: HeadersInit;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const buildUrl = (path: string) => {
  const normalizedBase = trimTrailingSlash(appEnv.apiBaseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

export const getStoredTenantSlug = () => {
  if (typeof window === "undefined") {
    return undefined;
  }

  const value = window.localStorage.getItem(TENANT_SLUG_STORAGE_KEY);
  return value && value.trim() ? value : undefined;
};

export const setStoredTenantSlug = (tenantSlug: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TENANT_SLUG_STORAGE_KEY, tenantSlug);
};

export const clearStoredTenantSlug = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TENANT_SLUG_STORAGE_KEY);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractErrorMessage = (payload: unknown, fallback: string) => {
  if (!isRecord(payload)) {
    return fallback;
  }

  const candidateKeys = ["message", "error", "detail"] as const;

  for (const key of candidateKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
};

export const unwrapData = (payload: unknown) => {
  if (!isRecord(payload)) {
    return payload;
  }

  if ("data" in payload) {
    return payload.data;
  }

  return payload;
};

export const apiRequest = async <T>(path: string, init: ApiRequestInit = {}): Promise<T> => {
  const { token, body, headers, ...requestInit } = init;
  const tenantSlug = getStoredTenantSlug();
  const response = await fetch(buildUrl(path), {
    ...requestInit,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantSlug ? { "X-Tenant-Slug": tenantSlug } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessage(payload, `Request failed with status ${response.status}.`),
      response.status,
      payload,
    );
  }

  return unwrapData(payload) as T;
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};
