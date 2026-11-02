import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

import { getCsrfToken } from "./auth";
import { CONSOLE_API_BASE } from "./console-api-origin";
import { ConsoleApiError, toConsoleApiError } from "./console-api-error";
import { requestStepUp } from "./mfa-step-up";

// One console API client (architecture §5): every console endpoint is under /api/internal (D2).

declare module "axios" {
  interface AxiosRequestConfig {
    /** Send an Idempotency-Key header (one UUID per user action, reused on every retry). */
    idempotent?: boolean;
    /** Do not redirect to /login on auth failures (the login page itself, background probes). */
    skipAuthRedirect?: boolean;
    _authRetry?: boolean;
    _stepUpRetry?: boolean;
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTH_ENDPOINTS = /\/auth\/(login|refresh|logout|mfa\/)/;

function currentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

export function loginUrlFor(next: string) {
  return next.startsWith("/login") ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}

/** Indirection so tests can observe redirects without a real navigation. */
export const consoleClientHooks = {
  redirectToLogin(next: string) {
    window.location.assign(loginUrlFor(next));
  },
  currentPath
};

/** A random UUID v4 from the Web Crypto API (randomUUID needs a secure context, getRandomValues does not). */
function newIdempotencyKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function withCsrf(config: InternalAxiosRequestConfig) {
  const method = config.method?.toUpperCase();
  if (method && MUTATING.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) config.headers.set("X-CSRF-Token", csrf);
  }
  if (config.idempotent && !config.headers.has("Idempotency-Key")) {
    config.headers.set("Idempotency-Key", newIdempotencyKey());
  }
  return config;
}

// Refresh goes through a bare instance so it never recurses into the interceptors.
export const refreshClient = axios.create({ baseURL: CONSOLE_API_BASE, withCredentials: true });
refreshClient.interceptors.request.use(withCsrf);

let refreshInFlight: Promise<void> | null = null;

/** One shared refresh for any number of concurrent 401s (ACC-CLIENT-1). */
export function refreshSession(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = refreshClient
      .post("/auth/refresh")
      .then(() => undefined)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function installInterceptors(instance: AxiosInstance) {
  instance.interceptors.request.use(withCsrf);
  instance.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const normalised = toConsoleApiError(error);
      const config = axios.isAxiosError(error) ? error.config : undefined;
      if (!config) throw normalised;
      const isAuthEndpoint = AUTH_ENDPOINTS.test(config.url ?? "");

      if (normalised.status === 401 && normalised.code === "MFA_PENDING") {
        if (!config.skipAuthRedirect) consoleClientHooks.redirectToLogin(consoleClientHooks.currentPath());
        throw normalised;
      }

      if (normalised.status === 401 && !config._authRetry && !isAuthEndpoint) {
        config._authRetry = true;
        try {
          await refreshSession();
        } catch {
          if (!config.skipAuthRedirect) consoleClientHooks.redirectToLogin(consoleClientHooks.currentPath());
          throw normalised;
        }
        return instance(config);
      }

      if (normalised.status === 403 && normalised.code === "MFA_REQUIRED" && !config._stepUpRetry && !isAuthEndpoint) {
        config._stepUpRetry = true;
        try {
          await requestStepUp();
        } catch {
          throw normalised;
        }
        // Same config object → same Idempotency-Key on the replay (ACC-CLIENT-3).
        return instance(config);
      }

      throw normalised;
    }
  );
  return instance;
}

export const consoleApi = installInterceptors(axios.create({ baseURL: CONSOLE_API_BASE, withCredentials: true }));

export { ConsoleApiError };
