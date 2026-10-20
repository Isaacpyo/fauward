import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

import { getCsrfToken } from "./auth";
import { ConsoleApiError, toConsoleApiError } from "./console-api-error";
import { requestStepUp } from "./mfa-step-up";

// One console API client (architecture §5). Phase 0 keeps a second instance on /api/v1/platform that shares the
// same interceptors; WP-1.1 deletes it.

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

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
export const refreshClient = axios.create({ baseURL: "/api/internal", withCredentials: true });
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

export const consoleApi = installInterceptors(axios.create({ baseURL: "/api/internal", withCredentials: true }));
/** @deprecated Phase 0 only: legacy /api/v1/platform endpoints. Removed in WP-1.1. */
export const platformApi = installInterceptors(axios.create({ baseURL: "/api/v1/platform", withCredentials: true }));

export { ConsoleApiError };
