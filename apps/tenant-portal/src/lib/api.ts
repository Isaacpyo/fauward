import axios from 'axios';
import { clearTokens, getAccessToken, getRefreshToken, getTenantSlug, hasDevTestSession, setTenantSlug, setTokens } from './auth';
import { resolvePathTenantSlug } from './tenantResolver';

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api';

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 8_000
});

function isPublicAuthEndpoint(url?: string) {
  return Boolean(url && /^\/?v1\/auth\/(login|register|forgot-password|reset-password|refresh)/.test(url));
}

// Inject the stored access token into every outgoing request.
api.interceptors.request.use((config) => {
  if (isPublicAuthEndpoint(config.url)) {
    delete config.headers['Authorization'];
    delete config.headers['X-Tenant-Slug'];
    return config;
  }

  const token = getAccessToken();
  const tenantSlug = resolvePathTenantSlug() ?? getTenantSlug();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  } else {
    delete config.headers['Authorization'];
  }
  if (tenantSlug) {
    config.headers['X-Tenant-Slug'] = tenantSlug;
  } else {
    delete config.headers['X-Tenant-Slug'];
  }
  return config;
});

// On a 401 response, attempt one silent token refresh.
// If the refresh also fails (expired / revoked), clear tokens and redirect.
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

function drainQueue(token: string | null, error: unknown = null) {
  for (const waiter of pendingQueue) {
    if (token) waiter.resolve(token);
    else waiter.reject(error);
  }
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => {
    const currentSlug = response.headers['x-tenant-slug-current'];
    const deprecatedSlug = response.headers['x-tenant-slug-deprecated'];
    if (typeof currentSlug === 'string' && currentSlug && typeof deprecatedSlug === 'string' && deprecatedSlug) {
      setTenantSlug(currentSlug);
      const pathSlug = resolvePathTenantSlug();
      if (pathSlug === deprecatedSlug && window.location.pathname.includes(`/t/${deprecatedSlug}`)) {
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname.replace(`/t/${deprecatedSlug}`, `/t/${currentSlug}`)}${window.location.search}`
        );
      }
    }
    return response;
  },
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean };
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (hasDevTestSession()) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers['Authorization'] = `Bearer ${token}`;
            resolve(api(original));
          },
          reject
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) throw new Error('no_refresh_token');

      const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken });
      setTokens(data.accessToken, data.refreshToken, data.tenantSlug);
      api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
      drainQueue(data.accessToken);
      original.headers['Authorization'] = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (refreshError) {
      drainQueue(null, refreshError);
      clearTokens();
      delete api.defaults.headers.common['Authorization'];
      delete api.defaults.headers.common['X-Tenant-Slug'];
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
